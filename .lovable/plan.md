# Plan — Vague 1 : Ingestion RAG réelle + Secrets Manager + JIT Cognito

## Objectif

Rendre la plateforme **vraiment utilisable en prod AWS** : uploads transformés en chunks vectorisés interrogeables, clés IA gérées côté SuperAdmin (UI → Secrets Manager), et utilisateurs Cognito mappés automatiquement à des `User` applicatifs.

Tout reste **rétro-compatible** avec le mode local (mocks + in-memory) grâce aux flags d'env existants (`bootstrapProviders()`).

---

## Lot A — Pipeline d'ingestion RAG (S3 → Textract/Transcribe → Chunks → Bedrock Embeddings → AOSS)

### A.1 Extraction de texte (worker)

Étendre `_backend-reference/apps/worker/src/ingestionPipeline.ts:extractText()` :

| Type MIME | Outil AWS | Mode |
|---|---|---|
| `text/*`, `text/markdown` | lecture S3 directe | sync |
| `application/pdf` natif | `pdf-parse` (npm) après GetObject | sync |
| `application/pdf` scanné, `image/*` | **Textract** `StartDocumentTextDetection` | async (job → callback SNS) |
| `application/vnd.openxmlformats-…wordprocessingml…` | `mammoth` | sync |
| `application/vnd.…presentationml…` | `pptx-text-parser` | sync |
| `audio/*`, `video/*` | **Transcribe** `StartTranscriptionJob` | async (job → callback SNS) |

Architecture asynchrone :
```text
SQS ingestion → worker
   ├── sync paths → extract → chunk → embed → AOSS → DB (PUBLISHED)
   └── async paths → start Textract/Transcribe job → DB (PROCESSING)
                                      ↓ SNS topic
                          → worker (handler #2) → fetch result → chunk → embed → AOSS
```

Nouveaux fichiers :
- `apps/worker/src/providers/aws/textract.ts` — `startJob()`, `fetchResult(jobId)`
- `apps/worker/src/providers/aws/transcribe.ts` — idem
- `apps/worker/src/providers/aws/bedrock-embeddings.ts` — `embed(text): Promise<number[]>` via `amazon.titan-embed-text-v2:0` (1024 dims)

### A.2 Embeddings via Bedrock

- Modèle par défaut : `amazon.titan-embed-text-v2:0` (1024 dims, multilingue, low cost).
- Configurable par env : `BEDROCK_EMBEDDING_MODEL`, fallback Cohere `cohere.embed-multilingual-v3` (1024 dims) si quota Titan KO.
- Adapter `packages/rag/src/vectorProvider.ts` : passer le vecteur calculé en argument (l'embedding ne se fait plus dans `vectorProvider` mais dans le worker → séparation extract/embed/index).

### A.3 OpenSearch Serverless — schéma + écriture

Compléter `apps/api/src/providers/aws/opensearch-vector.ts` (et l'usage worker) :

Index `mp-chunks` (créé idempotemment au boot worker) :
```json
{
  "mappings": {
    "properties": {
      "chunkId":    { "type": "keyword" },
      "documentId": { "type": "keyword" },
      "title":      { "type": "text" },
      "text":       { "type": "text" },
      "page":       { "type": "integer" },
      "section":    { "type": "keyword" },
      "language":   { "type": "keyword" },
      "industryTags":  { "type": "keyword" },
      "pmDomainTags":  { "type": "keyword" },
      "embedding":  { "type": "knn_vector", "dimension": 1024,
                      "method": { "name": "hnsw", "engine": "nmslib",
                                  "space_type": "cosinesimil" } }
    }
  }
}
```

Méthodes ajoutées :
- `upsertChunks(chunks: ChunkWithEmbedding[])` — bulk API
- `search(queryVec, { topK, filters: { industryTags?, pmDomainTags? }})` — kNN + post-filter
- `deleteByDocument(documentId)` — pour le `/reindex`

### A.4 Câblage API

- `POST /admin/kb/upload` (Fastify) :
  1. Crée `Document { status: UPLOADED }` en DB
  2. Signe une URL S3 PUT (front upload direct)
  3. Push job SQS `{ documentId, objectKey, mimeType }`
  4. Retourne `{ uploadUrl, documentId }`
- `POST /admin/kb/documents/:id/publish` : si statut `NEEDS_REVIEW`, lance re-extract+embed.
- `POST /admin/kb/documents/:id/reindex` : `vector.deleteByDocument()` puis ré-enqueue SQS.

### A.5 Terraform additions

- SNS topic `mp-ingestion-callback` + subscription Lambda OU SQS secondaire pour les callbacks Textract/Transcribe
- IAM task role worker : ajout `textract:Start*`, `textract:Get*`, `transcribe:Start*`, `transcribe:Get*`, `bedrock:InvokeModel` (sur les 2 modèles Titan/Cohere)
- Bedrock model access : enable Titan + Cohere dans la region (manuel via console AWS — documenté dans `DEPLOYMENT.md`)
- AOSS data access policy : ajouter le worker role en `aoss:WriteDocument`

### A.6 Tests

- Test e2e local : upload PDF natif → vérifier `PUBLISHED` + chunks en DB + kNN search renvoie le bon doc
- Test async : upload PDF scanné mock Textract → status `PROCESSING` → callback simulé → `PUBLISHED`

---

## Lot B — Clés IA via SuperAdmin → Secrets Manager

### B.1 Secrets structure

Un secret par provider, préfixé `mp/ai/` :
- `mp/ai/mistral` → `{ apiKey, model, configJson }`
- `mp/ai/openai`  → idem
- `mp/ai/tavily`  → `{ apiKey }`
- `mp/ai/serpapi` → `{ apiKey }`

KMS CMK dédiée (déjà provisionnée) ; rotation manuelle pour la V1 (lambda rotation = V2).

### B.2 Backend — endpoints SuperAdmin

`apps/api/src/services/aiProviderService.ts` (nouveau) :

```ts
class AiProviderService {
  async list(): Promise<AiProviderConfig[]>            // masque la clé
  async upsert(provider, payload): Promise<…>          // writeSecret + audit
  async rotate(provider, newKey): Promise<…>           // PutSecretValue + version stage
  async delete(provider): Promise<…>                   // DeleteSecret (recovery 7j)
  async getKey(provider): Promise<string>              // cache 5 min, lu par chatService
}
```

Routes :
- `GET    /superadmin/ai-providers` → liste avec `maskedKey: "••••••abcd"`
- `POST   /superadmin/ai-providers` → upsert
- `PATCH  /superadmin/ai-providers/:provider/rotate`
- `DELETE /superadmin/ai-providers/:provider`

Toutes émettent un `AuditEvent { action: "ai_provider.set|rotate|delete", actorId, entityType:"AiProvider", entityId: provider }`.

### B.3 Runtime — lecture côté `packages/ai`

Refactor `packages/ai/src/providers.ts` :
- `MistralProvider` et `OpenAIProvider` reçoivent un `keyResolver: () => Promise<string|null>` au lieu d'un `apiKey` statique.
- Le keyResolver pointe vers `AiProviderService.getKey()` qui :
  1. Cache en mémoire (TTL 5 min)
  2. Cache miss → `secretsManager.getSecretValue("mp/ai/mistral")`
  3. Invalidation sur événement interne `ai_provider.rotated`

Fallback : si Secrets Manager indisponible → `LocalGroundedProvider` (déjà en place).

### B.4 Frontend — `PromptAndModelSettings.tsx`

- Champ `apiKey` devient `password`, value affichée `••••••abcd` (`maskedKey` du backend).
- Boutons : `Sauvegarder` (upsert), `Rotater la clé` (modal nouveau key), `Supprimer`.
- Toast d'audit "Clé Mistral mise à jour par X il y a 2s" via subscribe `/superadmin/audit/events?entityType=AiProvider`.

### B.5 Terraform additions

- 4 ressources `aws_secretsmanager_secret` créées vides (placeholders) avec policy lecture restreinte au task role API
- IAM task role API : `secretsmanager:GetSecretValue` sur `mp/ai/*`, `secretsmanager:PutSecretValue|UpdateSecret|DeleteSecret` (pour endpoints superadmin)
- KMS key policy : `kms:Decrypt` pour task role API

---

## Lot C — JIT Provisioning Cognito ↔ DB

### C.1 Endpoint `GET /me`

Nouveau handler dans `apps/api/src/app.ts` :

```ts
fastify.get("/me", { preHandler: requireAuth }, async (req) => {
  const claims = req.user;                       // injecté par CognitoAuthProvider
  let user = await repo.users.findById(claims.sub);
  if (!user) {
    user = await repo.users.create({
      id:         claims.sub,
      email:      claims.email!,
      name:       claims["cognito:username"] ?? claims.email!,
      role:       claims.role,                   // déjà mappé depuis cognito:groups
      status:     claims.role === "CONSULTANT" ? "PENDING_MANAGER" : "ACTIVE",
      language:   "fr",
      managerId:  null,
      department: null
    });
    await audit("user.jit_provisioned", user.id);
  } else if (user.role !== claims.role) {
    // sync rôle si groupe Cognito a changé
    user = await repo.users.update(user.id, { role: claims.role });
    await audit("user.role_synced", user.id);
  }
  return { user };
});
```

### C.2 Création utilisateur via SuperAdmin → Cognito

Endpoint `POST /superadmin/users` existant : faire un **dual write transactionnel** :

```ts
1. cognito.adminCreateUser({ email, temporaryPassword, MessageAction: "SUPPRESS" | "RESEND" })
2. cognito.adminAddUserToGroup({ groupName: role })
3. repo.users.create({ id: cognitoSub, ... })  // dans la même transaction Prisma
4. rollback Cognito si DB fail (adminDeleteUser)
```

### C.3 Workflow approbation consultant

Dans `ConsultantApprovals.tsx` (déjà en place côté UI) → `POST /managers/consultants/:id/approve` :
- `repo.users.update({ status: "ACTIVE", managerId: req.user.id })`
- `cognito.adminEnableUser()` si désactivé
- Audit event

### C.4 Sync rôle inverse (changement de groupe Cognito)

Webhook Cognito post-confirmation (Lambda trigger `PostAuthentication`) → POST sur `/internal/webhooks/cognito/sync` (signé HMAC) → met à jour `user.role` en DB.

V1 : pas de Lambda, on se contente du resync sur chaque `/me` (cf. C.1). Lambda = V2.

### C.5 Terraform additions

- IAM task role API : ajout `cognito-idp:AdminCreateUser`, `AdminAddUserToGroup`, `AdminRemoveUserFromGroup`, `AdminDeleteUser`, `AdminEnableUser`, `AdminDisableUser`, `AdminGetUser`, `AdminListGroupsForUser` (sur l'ARN du User Pool uniquement)
- Cognito groups Terraform-managés : `SUPER_ADMIN`, `MANAGER`, `AUDITOR`, `CONSULTANT` (déjà OK, vérifier)

### C.6 Frontend

- `auth/cognitoProvider.ts:buildSession()` appelle déjà `/me` → rien à changer côté UI, le user vient enrichi par le backend.
- `LoginPage.tsx` : ajouter un état "Compte en attente de validation manager" si `status === PENDING_MANAGER` → rediriger sur le flow `FirstVisitManagerSelection`.

---

## Fichiers à créer / modifier

**Lot A — Ingestion**
- ➕ `apps/worker/src/providers/aws/textract.ts`
- ➕ `apps/worker/src/providers/aws/transcribe.ts`
- ➕ `apps/worker/src/providers/aws/bedrock-embeddings.ts`
- ✏️ `apps/worker/src/ingestionPipeline.ts` — vrais extracteurs
- ✏️ `apps/worker/src/providers/aws/sqs-consumer.ts` — gérer 2 types de messages (ingestion / callback)
- ✏️ `apps/api/src/providers/aws/opensearch-vector.ts` — schema + bulk upsert + kNN + delete
- ✏️ `apps/api/src/app.ts` — routes `/admin/kb/*` rebranchées
- ✏️ `infra/aws/iam.tf`, `infra/aws/aoss.tf`, `infra/aws/sns.tf` (nouveau)

**Lot B — Secrets**
- ➕ `apps/api/src/services/aiProviderService.ts`
- ✏️ `packages/ai/src/providers.ts` — keyResolver async + cache
- ✏️ `apps/api/src/app.ts` — routes `/superadmin/ai-providers/*`
- ✏️ `src/mp/components/PromptAndModelSettings.tsx` — UI clé masquée + rotate
- ✏️ `infra/aws/iam.tf`, `infra/aws/secrets.tf` (nouveau)

**Lot C — JIT**
- ✏️ `apps/api/src/app.ts` — `/me`, `/superadmin/users`, `/managers/consultants/:id/approve`
- ✏️ `apps/api/src/repository/prisma-repo.ts` — méthodes users.create/update/findById
- ✏️ `src/mp/components/LoginPage.tsx` — branche `PENDING_MANAGER`
- ✏️ `infra/aws/iam.tf` — permissions Cognito admin
- ✏️ `_backend-reference/DEPLOYMENT.md` — section "Activer Bedrock + Textract dans la région"

---

## Validation

| # | Test | Critère |
|---|---|---|
| 1 | Upload `test.txt` via UI | Statut `PUBLISHED` en < 5s, chunks visibles `/admin/kb/documents/:id` |
| 2 | Upload `scan.pdf` (scanné) | Statut `PROCESSING` puis `PUBLISHED` après callback Textract |
| 3 | Chat consultant avec question dans le PDF | Réponse cite la source avec le bon `chunkId` |
| 4 | SuperAdmin entre clé Mistral | Audit event créé, clé masquée affichée, `/chat` utilise Mistral |
| 5 | Rotation clé Mistral | Anciennes requêtes en cours ne plantent pas, nouvelles utilisent la nouvelle clé sous 5 min |
| 6 | Login Cognito d'un nouveau user (groupe CONSULTANT) | User créé en DB avec `status: PENDING_MANAGER`, redirigé vers `FirstVisitManagerSelection` |
| 7 | Manager approuve | Statut `ACTIVE`, login suivant arrive directement au chat |

---

## Hors scope (Vague 2/3)

- Lambda de rotation automatique Secrets Manager
- Tracking coûts/tokens + enforcement budget (Vague 2)
- Sync rôle Cognito → DB via Lambda PostAuthentication (V2)
- Step Functions pour orchestrer le pipeline (Vague 3)
- X-Ray instrumentation

---

## Estimation effort

- Lot A : ~1.5 jour (le plus lourd, async Textract/Transcribe)
- Lot B : ~0.5 jour
- Lot C : ~0.5 jour
- Doc + Terraform + tests : ~0.5 jour

**Total : ~3 jours de dev** pour avoir une plateforme prod-ready end-to-end côté ingestion + IA + identité.
