# Plan — Vague 3 : Orchestration, observabilité fine, rate-limit & billing

> Vagues 1 & 2 livrées. Cette vague durcit la prod : orchestration, traçage, garde-fous techniques, et facturation client.

## Objectif

- Sortir les jobs RAG lourds du worker monolithique → **Step Functions** avec retry + DLQ + UI console.
- **X-Ray** sur chaque requête `/chat` et `/admin/kb/*` pour debug end-to-end.
- **Rate-limit tokens/min** par `(user, model)` (token-bucket Redis ou mémoire) + **quotas par modèle/rôle**.
- **Export quotidien des UsageEvent vers Stripe** (metered billing) pour facturer les orgs clientes.

Rétro-compat : sans `INGESTION_STATE_MACHINE_ARN`/`AWS_XRAY_DAEMON_ADDRESS`/`REDIS_URL`/`STRIPE_SECRET_KEY`, tout dégrade vers le comportement Vague 2.

---

## Lot A — Step Functions ingestion lourde

- `infra/aws/stepfunctions/ingestion.asl.json` : ASL `Classify → Route → (Extract sync | Textract waitForTaskToken | Transcribe waitForTaskToken) → Chunk → EmbedBatches (Map MaxConcurrency=4, retry sur BedrockThrottling) → IndexBulk → MarkPublished`. Catch global → `MarkFailed`.
- `apps/worker/src/providers/aws/stepfunctions-ingestion.ts` : `startIngestionExecution()` + `shouldUseStepFunctions(mime, size)` (audio/vidéo, images, PDF > 5 Mo).
- Le worker SQS Vague 1 reste actif pour les jobs « light » ; le routage se fait par taille/MIME.
- Terraform : `aws_sfn_state_machine` + 6 Lambdas (classify/extract/chunk/embed/index/update-status) + SNS topic + rôle Textract.

## Lot B — X-Ray

- `apps/api/src/providers/aws/xray.ts` : `traceAsync()`, `captureAwsClient()`, `xrayFastifyHook()`. Activé uniquement quand `AWS_XRAY_DAEMON_ADDRESS` set.
- Sampling 100 % `/chat`, 50 % `/admin/kb/*`, 10 % autres.
- Annotations injectées : `requestId`, `route`, `model`, `documentId`.
- IAM : `xray:PutTraceSegments`, `xray:PutTelemetryRecords` sur le task role.

## Lot C — Rate-limit + quotas modèles

- `services/rateLimitService.ts` : token-bucket par `(userId, providerModel)`, defaults par modèle, override env `RATE_LIMIT_*`. Repos `InMemoryRateLimitRepo` (dev) et Lua atomique Redis (prod).
- `services/modelPolicy.ts` : whitelist par rôle (wildcards `*`), override `MODEL_POLICY_JSON`. `assertAllowed()` levé en 403 dans `chatService`.
- `/chat` ajoute : check `assertAllowed()`, puis `rateLimit.tryConsume(estimateTokens(prompt))` → 429 si refusé.
- `/me/models` (nouveau) expose `allowedModels(role)` pour pré-filtrer le sélecteur UI.

## Lot D — Export billing Stripe

- `services/stripeBillingExporter.ts` : agrège `UsageEvent` du jour J-1 par `(orgId, meter)`, push `subscription_items.createUsageRecord` avec idempotency key `mp-usage-{orgId}-{meter}-{YYYYMMDD}`.
- Compteurs : `chat-tokens`, `embed-tokens`, `ocr-pages`, `transcribe-minutes`.
- `apps/lambda/billing-export/index.ts` : invoqué via EventBridge `cron(0 2 * * ? *)`.
- Table `OrgBilling(orgId, stripeCustomerId, subItem* per meter)`.
- Secret `mp/stripe/secret` dans Secrets Manager.

---

## Fichiers créés (`_backend-reference/`)

- `infra/aws/stepfunctions/ingestion.asl.json`
- `apps/worker/src/providers/aws/stepfunctions-ingestion.ts`
- `apps/api/src/providers/aws/xray.ts`
- `apps/api/src/services/rateLimitService.ts`
- `apps/api/src/services/modelPolicy.ts`
- `apps/api/src/services/stripeBillingExporter.ts`
- `apps/lambda/billing-export/index.ts`
- `DEPLOYMENT_WAVE3.md`

## À câbler (extraits dans `DEPLOYMENT_WAVE3.md`)

- `app.ts` : hook X-Ray, `assertAllowed` + `rateLimit.tryConsume` dans `/chat`, route `/me/models`, refactor `/admin/kb/upload` pour invoquer Step Functions sur jobs lourds.
- Frontend (Vague 3bis) : sélecteur modèles filtré par `/me/models`, toast 429 « ralentissez », badge trace-id copiable en footer chat.

---

## Validation

| # | Test | Critère |
|---|---|---|
| 1 | Upload PDF scanné 20 Mo | Step Functions affiche le flow complet jusqu'à `MarkPublished` |
| 2 | Spam 200 chats/min | 429 `rate_limited` après burst |
| 3 | Consultant tente Claude Opus | 403 `model_not_allowed` |
| 4 | Console X-Ray | Service map API → Bedrock → AOSS avec latences |
| 5 | Lambda billing déclenché manuellement | Stripe Dashboard montre les usage records ; re-run = no-op idempotent |

---

## Hors scope (Vague 4)

- Cache résultats LLM (prompts identiques cross-user)
- A/B testing modèles
- Anonymisation PII avant Bedrock (Macie / Comprehend PII)
- Multi-region failover (us-east-1 → eu-west-1)
- Auto-scaling AOSS OCU sur charge

## Estimation effort

- Lot A : ~1.5 jour (ASL + 6 Lambdas + Terraform SFN)
- Lot B : ~0.5 jour
- Lot C : ~0.5 jour
- Lot D : ~0.5 jour
- Doc + tests : ~0.5 jour

**Total : ~3.5 jours.**
