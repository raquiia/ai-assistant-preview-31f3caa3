# Plan — Vague 2 : Tracking coûts/tokens + budgets + Lambdas Cognito/Rotation

> Vague 1 (`DEPLOYMENT_WAVE1.md`) livrée : Cognito + Secrets Manager + RAG Bedrock/AOSS opérationnels.

## Objectif

Donner à la plateforme un **contrôle financier et opérationnel** :
- chaque appel IA est compté (tokens + USD) et tracé en DB + CloudWatch ;
- les utilisateurs/rôles/orgs ont un budget mensuel avec alerte 80 % et coupe-circuit 100 % ;
- les rôles Cognito sont resyncés automatiquement (Lambda PostAuthentication) ;
- les clés IA peuvent être rotatées via Secrets Manager (Lambda dédié).

Compatible local : sans `AWS_REGION` les métriques sont no-op, sans règle `Budget` ni env `BUDGET_DEFAULT_*_USD` le guard laisse passer.

---

## Lot A — Comptabilité (UsageEvent + CloudWatch)

- `services/pricing.ts` : table tarifaire par `provider:model` (Bedrock Titan/Cohere/Claude, Mistral, OpenAI, Textract page, Transcribe minute, Tavily, SerpAPI). Overrides via `PRICING_OVERRIDES_JSON`.
- `providers/aws/cloudwatch-metrics.ts` : `PutMetricData` namespace `MP/Usage`, dims `(provider, model, role, orgId, route)`.
- `services/usageTrackingService.ts` : `record(cost, ctx)` → insère `UsageEvent` + publie métriques en parallèle ; expose `costSince()` / `tokensSince()`.
- Migration SQL `wave2_usage_budgets.sql` : table `UsageEvent` + index `(userId, createdAt)`, `(orgId, createdAt)`, `(route, createdAt)`.

## Lot B — Budgets + coupe-circuit

- `services/budgetService.ts` : résolution règle (user → role → org → env), fenêtre mensuelle UTC, statut `ok | warn | blocked`, `BudgetExceededError` (HTTP 402).
- `middleware/budgetGuard.ts` : preHandler Fastify ; bloque avec 402 + body structuré, ou pose un header `X-Budget-Warning` à 80 %.
- Table `Budget` (scope user/role/org/global) avec partial unique indexes.
- `/me` renvoie `{ user, budget }` pour que l'UI affiche la jauge.

## Lot C — Lambdas AWS

- `apps/lambda/cognito-post-auth/` : déclenchée par Cognito PostAuthentication/PostConfirmation, POST signé HMAC vers `/api/public/webhooks/cognito/sync` qui resync `User.role`.
- `apps/lambda/secrets-rotation/` : implémente le contrat 4-steps Secrets Manager (`createSecret`, `setSecret`, `testSecret`, `finishSecret`). Pour clés IA, `AWSPENDING` est écrit par la UI SuperAdmin ; le Lambda valide + promeut en `AWSCURRENT`.

---

## Fichiers créés / modifiés

### Créés (`_backend-reference/`)
- `apps/api/src/services/pricing.ts`
- `apps/api/src/services/usageTrackingService.ts`
- `apps/api/src/services/budgetService.ts`
- `apps/api/src/middleware/budgetGuard.ts`
- `apps/api/src/providers/aws/cloudwatch-metrics.ts`
- `apps/lambda/cognito-post-auth/index.ts`
- `apps/lambda/secrets-rotation/index.ts`
- `prisma/migrations/wave2_usage_budgets.sql`
- `DEPLOYMENT_WAVE2.md`

### À câbler dans `apps/api/src/app.ts` (extraits dans `DEPLOYMENT_WAVE2.md` §3)
- preHandler `budgetGuard` sur `/chat`, `/admin/kb/*`, `/search`.
- appel `usage.record()` après chaque opération IA (chat, embed, OCR, transcribe, search).
- handler `/api/public/webhooks/cognito/sync` (HMAC verify + role sync).
- `/me` retournant le budget courant.

### Frontend (futur, Vague 2bis)
- Jauge budget dans `Topbar.tsx` (lit `/me.budget`).
- Toast 80 % / écran 402 avec lien support dans `ChatView.tsx`.
- Section « Budgets » dans `SuperAdminPanel.tsx` (CRUD `Budget`).

---

## Validation

| # | Test | Critère |
|---|---|---|
| 1 | 1 chat consultant | `UsageEvent` en DB + métrique `CostUsd` visible CloudWatch < 1 min |
| 2 | Régler `Budget.monthlyUsd=0.01` → relancer chat | HTTP 402 `{error:"budget_exceeded"}` |
| 3 | Approcher 85 % du budget | HTTP 200 + header `X-Budget-Warning` |
| 4 | Changer le groupe Cognito d'un user → relogin | `User.role` en DB synchronisé sans intervention |
| 5 | Rotation Mistral via SuperAdmin | Lambda promeut `AWSPENDING` → `AWSCURRENT`, chat utilise la nouvelle clé sous 5 min (TTL cache `aiProviderService`) |

---

## Hors scope (Vague 3)

- Rate-limit tokens/min (complément du budget mensuel)
- Step Functions orchestration ingestion lourde
- X-Ray instrumentation bout-en-bout
- Multi-tenant billing exports (Stripe)
- Quotas par modèle (interdire Claude Opus aux consultants)

## Estimation effort

- Lot A : ~0.5 jour
- Lot B : ~0.5 jour
- Lot C (2 Lambdas + Terraform) : ~0.5 jour
- Câblage `app.ts` + tests + doc : ~0.5 jour

**Total : ~2 jours.**
