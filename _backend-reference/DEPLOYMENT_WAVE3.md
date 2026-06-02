# Vague 3 — Orchestration, observabilité fine, rate-limit & billing

> Pré-requis : **Vagues 1 & 2 déployées** (Cognito + RAG Bedrock + UsageEvent + Budgets opérationnels).

## Ce que la Vague 3 apporte

1. **Step Functions** pour orchestrer l'ingestion lourde (OCR, transcription, gros PDFs) avec retry + DLQ + visibilité console.
2. **AWS X-Ray** pour tracer chaque requête `/chat` et `/admin/kb/*` bout-en-bout (API → Bedrock → AOSS → DB).
3. **Rate-limit token-bucket** (Redis ou in-memory) par `(user, model)` en complément du budget mensuel.
4. **Quotas par modèle / rôle** : un consultant ne peut pas appeler Claude Opus.
5. **Export billing Stripe** : agrégation quotidienne `UsageEvent` → `Stripe.subscriptionItems.createUsageRecord` (idempotent).

---

## 1. Step Functions ingestion

Fichier : `infra/aws/stepfunctions/ingestion.asl.json`

États : `Classify → RouteByKind → (ExtractSync | StartTextract.waitForTaskToken | StartTranscribe.waitForTaskToken) → Chunk → EmbedBatches (Map, MaxConcurrency=4) → IndexBulk → MarkPublished`. Retry exponentiel sur `BedrockThrottlingException`. Catch global → `MarkFailed`.

Terraform (extrait) :

```hcl
resource "aws_sfn_state_machine" "ingestion" {
  name     = "mp-ingestion"
  role_arn = aws_iam_role.sfn.arn
  definition = templatefile("${path.module}/stepfunctions/ingestion.asl.json", {
    ClassifyFunctionArn        = aws_lambda_function.classify.arn
    ExtractFunctionArn         = aws_lambda_function.extract.arn
    ChunkFunctionArn           = aws_lambda_function.chunk.arn
    EmbedFunctionArn           = aws_lambda_function.embed.arn
    IndexFunctionArn           = aws_lambda_function.index.arn
    UpdateStatusFunctionArn    = aws_lambda_function.update_status.arn
    S3KnowledgeBucket          = aws_s3_bucket.knowledge.bucket
    TextractRoleArn            = aws_iam_role.textract_sns.arn
    IngestionCallbackTopicArn  = aws_sns_topic.ingestion_callback.arn
  })
}
```

Câblage worker : `shouldUseStepFunctions(mime, size)` route vers `startIngestionExecution()` ; les jobs « light » restent dans le pipeline SQS Vague 1. Variable `INGESTION_STATE_MACHINE_ARN` requise.

---

## 2. X-Ray

Module : `providers/aws/xray.ts` — actif uniquement quand `AWS_XRAY_DAEMON_ADDRESS` est défini (auto-injecté en ECS/Lambda).

```ts
const bedrock = captureAwsClient(new BedrockRuntimeClient({ region }));
await traceAsync("bedrock.embed", { model }, () => bedrock.send(cmd));
```

Hook Fastify : `fastify.addHook("onRequest", xrayFastifyHook())`. Le `Root=...` est exposé en réponse → le front peut afficher un lien support « copier trace ID ».

Sampling : 100 % `/chat`, 50 % `/admin/kb/*`, 10 % autres.

---

## 3. Rate-limit tokens/min

`services/rateLimitService.ts` :
- Defaults : Claude Sonnet 40k/min burst 80k, Haiku 100k/min, Mistral Large 30k/min.
- Override par modèle via env : `RATE_LIMIT_BEDROCK_ANTHROPIC_CLAUDE_3_5_SONNET_20241022_V2_0=50000:100000`.
- Repo : `InMemoryRateLimitRepo` (dev) ou Redis avec le script Lua atomique fourni (`REDIS_BUCKET_LUA`).

Câblage `/chat` :

```ts
const ok = await rateLimits.tryConsume(user.sub, `${provider}:${model}`, estimateInputTokens(prompt));
if (!ok) return reply.code(429).send({ error: "rate_limited", retryAfterSec: 30 });
```

---

## 4. Quotas par modèle

`services/modelPolicy.ts` : whitelists par rôle, wildcards `*` (préfixe).

- `SUPER_ADMIN` : `*`
- `MANAGER` : `bedrock:*`, `mistral:*`, `openai:*`
- `AUDITOR` : Sonnet + Haiku + Mistral Large
- `CONSULTANT` : Haiku + Mistral Small + GPT-4o-mini

Override : `MODEL_POLICY_JSON='{"CONSULTANT":[...]}'`.

À appeler dans `chatService` avant Bedrock : `assertAllowed(user.role, ${provider}:${model})` → 403 `ModelNotAllowedError`.

UI : `GET /me/models` (à exposer) → `allowedModels(role)` pour pré-filtrer le sélecteur de modèle.

---

## 5. Export billing Stripe

`services/stripeBillingExporter.ts` + Lambda `apps/lambda/billing-export/`.

Compteurs (`Meter`) :
- `chat-tokens`
- `embed-tokens`
- `ocr-pages`
- `transcribe-minutes`

Mapping : `meterFor(route, provider)`. Stripe subscription item id par org × meter chargé via `BillingRepo.getStripeItems(orgId)` (table `OrgBilling` à ajouter — voir SQL ci-dessous).

EventBridge :

```hcl
resource "aws_cloudwatch_event_rule" "billing_daily" {
  name                = "mp-billing-export"
  schedule_expression = "cron(0 2 * * ? *)"
}
resource "aws_cloudwatch_event_target" "billing_daily" {
  rule = aws_cloudwatch_event_rule.billing_daily.name
  arn  = aws_lambda_function.billing_export.arn
}
```

Secrets : `STRIPE_SECRET_KEY` dans Secrets Manager `mp/stripe/secret`.

```sql
CREATE TABLE IF NOT EXISTS "OrgBilling" (
  "orgId"              TEXT PRIMARY KEY,
  "stripeCustomerId"   TEXT NOT NULL,
  "subItemChatTokens"  TEXT,
  "subItemEmbedTokens" TEXT,
  "subItemOcrPages"    TEXT,
  "subItemTranscribeMinutes" TEXT,
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. IAM additions (Terraform)

Task role API :
- `xray:PutTraceSegments`, `xray:PutTelemetryRecords`

Step Functions role :
- `lambda:InvokeFunction` sur les 6 Lambdas du flow
- `textract:StartDocumentTextDetection`, `transcribe:StartTranscriptionJob`
- `iam:PassRole` sur `TextractRoleArn` (publication SNS)

Lambda billing-export :
- `secretsmanager:GetSecretValue` sur `mp/stripe/*`
- accès réseau Internet (pour stripe.com) — VPC NAT ou Lambda hors VPC

---

## 7. Validation

| # | Test | Critère |
|---|---|---|
| 1 | Upload PDF 20 Mo scanné | Console Step Functions montre flow `StartTextract → Chunk → EmbedBatches → IndexBulk → MarkPublished` |
| 2 | Chat consultant qui spam 200 requêtes/min | 429 `rate_limited` après burst épuisé |
| 3 | Consultant demande Claude Opus | 403 `model_not_allowed` |
| 4 | Console X-Ray | service map montre API → Bedrock → AOSS avec latences |
| 5 | Lambda `billing-export` invoquée manuellement | `subscription_items.createUsageRecord` visible dans Stripe Dashboard ; rerun ne double-compte pas |

---

## Hors scope (Vague 4)

- Cache résultats LLM (cross-user prompts identiques)
- A/B testing modèles
- Anonymisation PII avant Bedrock (Macie / Comprehend PII)
- Multi-region failover (us-east-1 → eu-west-1)
