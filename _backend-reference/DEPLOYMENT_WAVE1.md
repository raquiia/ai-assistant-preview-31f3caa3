# Vague 1 — Activation AWS production-ready

Ce document complète `DEPLOYMENT.md` pour activer le pipeline RAG, la gestion
des clés IA via Secrets Manager, et le JIT provisioning Cognito ↔ DB.

## 1. Variables d'environnement (ECS task definitions)

API et worker partagent :

```bash
AWS_REGION=eu-west-3
S3_KNOWLEDGE_BUCKET=mp-knowledge-prod
SQS_INGESTION_URL=https://sqs.eu-west-3.amazonaws.com/<acct>/mp-ingestion
SQS_CALLBACK_URL=https://sqs.eu-west-3.amazonaws.com/<acct>/mp-ingestion-callback
SNS_TEXTRACT_TOPIC_ARN=arn:aws:sns:eu-west-3:<acct>:mp-textract-callbacks
SNS_TEXTRACT_ROLE_ARN=arn:aws:iam::<acct>:role/mp-textract-publish
COGNITO_USER_POOL_ID=eu-west-3_xxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxx
AOSS_ENDPOINT=https://xxxxxxxx.eu-west-3.aoss.amazonaws.com
SECRETS_PREFIX=mp                            # secrets stockés sous mp/ai/<provider>
BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_FALLBACK_MODEL=cohere.embed-multilingual-v3
KMS_KEY_ID=arn:aws:kms:eu-west-3:<acct>:key/xxxx
```

Le code dégrade proprement vers les providers in-memory si l'une de ces
variables est absente (cf. `bootstrapProviders()`).

## 2. Activer les modèles Bedrock (manuel, une fois par région)

Console AWS → **Bedrock → Model access** → activer :

- `amazon.titan-embed-text-v2` (embeddings, défaut)
- `cohere.embed-multilingual-v3` (fallback)

Sans cela, `InvokeModelCommand` retourne `AccessDeniedException`.

## 3. IAM — rôles à étendre

### Task role API

```hcl
statement {
  sid     = "Cognito"
  actions = [
    "cognito-idp:AdminCreateUser",
    "cognito-idp:AdminDeleteUser",
    "cognito-idp:AdminAddUserToGroup",
    "cognito-idp:AdminRemoveUserFromGroup",
    "cognito-idp:AdminEnableUser",
    "cognito-idp:AdminDisableUser",
    "cognito-idp:AdminGetUser",
    "cognito-idp:AdminListGroupsForUser",
  ]
  resources = [aws_cognito_user_pool.main.arn]
}

statement {
  sid     = "Secrets"
  actions = [
    "secretsmanager:GetSecretValue",
    "secretsmanager:CreateSecret",
    "secretsmanager:UpdateSecret",
    "secretsmanager:PutSecretValue",
    "secretsmanager:DeleteSecret",
    "secretsmanager:DescribeSecret",
  ]
  resources = ["arn:aws:secretsmanager:${region}:${account}:secret:mp/ai/*"]
}

statement {
  sid       = "KmsForSecrets"
  actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
  resources = [aws_kms_key.app.arn]
}
```

### Task role Worker

```hcl
statement {
  sid     = "Textract"
  actions = ["textract:StartDocumentTextDetection", "textract:GetDocumentTextDetection"]
  resources = ["*"]
}
statement {
  sid     = "Transcribe"
  actions = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
  resources = ["*"]
}
statement {
  sid     = "Bedrock"
  actions = ["bedrock:InvokeModel"]
  resources = [
    "arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0",
    "arn:aws:bedrock:${region}::foundation-model/cohere.embed-multilingual-v3",
  ]
}
statement {
  sid     = "Aoss"
  actions = ["aoss:APIAccessAll"]
  resources = [aws_opensearchserverless_collection.kb.arn]
}
```

### AOSS data access policy

Ajouter le worker role en `aoss:WriteDocument` / `aoss:CreateIndex` et l'API
role en `aoss:ReadDocument`.

## 4. SNS / SQS — callbacks Textract & Transcribe

```text
Textract job  ─►  SNS mp-textract-callbacks  ─►  SQS mp-ingestion-callback  ─►  worker
Transcribe    ─►  EventBridge rule           ─►  SQS mp-ingestion-callback  ─►  worker
```

EventBridge rule pour Transcribe (Terraform pseudo) :

```hcl
resource "aws_cloudwatch_event_rule" "transcribe_done" {
  event_pattern = jsonencode({
    source        = ["aws.transcribe"],
    "detail-type" = ["Transcribe Job State Change"],
    detail        = { TranscriptionJobStatus = ["COMPLETED", "FAILED"] }
  })
}
resource "aws_cloudwatch_event_target" "to_sqs" {
  rule = aws_cloudwatch_event_rule.transcribe_done.name
  arn  = aws_sqs_queue.ingestion_callback.arn
}
```

## 5. Secrets Manager — bootstrap

Créer les 4 secrets vides (Terraform `aws_secretsmanager_secret`) :

- `mp/ai/mistral`
- `mp/ai/openai`
- `mp/ai/tavily`
- `mp/ai/serpapi`

Tous chiffrés avec la CMK `aws_kms_key.app`. Le SuperAdmin renseignera les
valeurs depuis l'UI `PromptAndModelSettings` après le premier déploiement.

## 6. Validation post-déploiement

| # | Test | Critère |
|---|---|---|
| 1 | Upload `test.txt` via UI SuperAdmin | Statut `PUBLISHED` < 5 s, chunks visibles |
| 2 | Upload `scan.pdf` (scanné) | `PROCESSING` puis `PUBLISHED` après callback Textract |
| 3 | Chat consultant avec question dans le PDF | Réponse cite la source avec bon `chunkId` |
| 4 | SuperAdmin entre clé Mistral | Audit `ai_provider.set`, masquage `••••••abcd`, `/chat` utilise Mistral |
| 5 | Rotation clé Mistral | Nouvelles requêtes utilisent la nouvelle clé < 5 min (TTL cache) |
| 6 | Login Cognito nouvel utilisateur (groupe CONSULTANT) | Row DB créée `status=PENDING_MANAGER`, redirection FirstVisitManagerSelection |
| 7 | Manager approuve | `status=ACTIVE`, prochain login → chat direct |

## 7. Hors scope (Vague 2/3)

- Rotation automatique Secrets Manager (Lambda rotation)
- Tracking coûts / tokens + enforcement budget (Vague 2)
- Lambda PostAuthentication pour sync rôle Cognito → DB en push (V2)
- Step Functions pour l'orchestration du pipeline (Vague 3)
- X-Ray instrumentation
