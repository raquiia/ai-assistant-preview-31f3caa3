# Vague 2 — Tracking coûts/tokens, budgets, observabilité & Lambdas

> Pré-requis : **Vague 1 déployée** (Cognito + Secrets Manager + RAG Bedrock/AOSS opérationnels — voir `DEPLOYMENT_WAVE1.md`).

## Ce que la Vague 2 apporte

1. **Comptabilité fine** de chaque appel IA (chat, embeddings, OCR, transcription, recherche) → ledger `UsageEvent` en DB + métriques CloudWatch.
2. **Budgets mensuels** par utilisateur / rôle / org avec coupe-circuit HTTP 402 et warning soft à 80 %.
3. **Lambdas de support** : sync rôle Cognito → DB (PostAuthentication) et rotation des clés IA dans Secrets Manager.

---

## 1. Schéma DB (Prisma)

Appliquer la migration :

```bash
psql "$DATABASE_URL" -f _backend-reference/prisma/migrations/wave2_usage_budgets.sql
# puis aligner Prisma : prisma db pull && prisma generate
```

Tables ajoutées :
- `UsageEvent` — un événement par appel IA (provider, model, tokens, coût USD, latence, requestId).
- `Budget` — règles par scope (user / role / org / global).

Index `UsageEvent_user_date` + `Budget_*_uq` garantissent que `BudgetService.getStatus()` reste O(log n).

---

## 2. Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `AWS_REGION` | active CloudWatch metrics | — |
| `CLOUDWATCH_NAMESPACE` | namespace métriques | `MP/Usage` |
| `PRICING_OVERRIDES_JSON` | override tarif par modèle | `{}` |
| `BUDGET_DEFAULT_CONSULTANT_USD` | fallback si pas de règle DB | non défini = no budget |
| `BUDGET_DEFAULT_MANAGER_USD` | idem | idem |
| `BUDGET_DEFAULT_SUPER_ADMIN_USD` | idem (souvent illimité) | idem |
| `API_INTERNAL_URL` | URL appelée par le Lambda Cognito | — |
| `WEBHOOK_SECRET` | HMAC partagé Lambda ↔ API | obligatoire pour le sync |

---

## 3. Câblage dans `app.ts` (extrait à appliquer)

```ts
import { UsageTrackingService } from "./services/usageTrackingService";
import { BudgetService } from "./services/budgetService";
import { budgetGuard } from "./middleware/budgetGuard";

const usage = new UsageTrackingService(repo.usage);
const budgets = new BudgetService(repo.budgets, usage);

// Chat / RAG : preHandler bloque si > hard cap
fastify.post("/chat",
  { preHandler: [requireAuth, budgetGuard(budgets)] },
  async (req, reply) => {
    const t0 = Date.now();
    const result = await chatService.ask(req.body, req.user);
    await usage.record(
      { provider: result.provider, model: result.model,
        inputTokens: result.usage.input, outputTokens: result.usage.output },
      { userId: req.user.sub, role: req.user.role, orgId: req.user.orgId,
        route: "POST /chat", latencyMs: Date.now() - t0, requestId: req.id },
    );
    return result;
  },
);

// /me renvoie aussi le statut budget pour l'UI
fastify.get("/me", { preHandler: requireAuth }, async (req) => {
  const user = await jitProvisionUser(req.user);
  const budget = await budgets.getStatus({ userId: user.id, role: user.role, orgId: user.orgId });
  return { user, budget };
});

// Webhook Cognito → resync rôle DB
fastify.post("/api/public/webhooks/cognito/sync", async (req, reply) => {
  // verify HMAC X-Webhook-Signature (cf. public-api-endpoints)
  // puis repo.users.update({ id: sub, role: mapGroups(groups) })
});
```

Le worker (Bedrock embeddings, Textract, Transcribe) appelle aussi
`usage.record(...)` après chaque appel SDK ; il partage le module.

---

## 4. CloudWatch — dashboards & alarmes

Métriques publiées sous `MP/Usage` :
- `CostUsd` (somme = $ dépensés)
- `TokensInput`, `TokensOutput`
- `LatencyMs`
- `BudgetExceeded` (count des 402)

Alarmes recommandées :
- `BudgetExceeded` > 0 sur 5 min → SNS ops
- `CostUsd` (sum/jour, dim: role) > seuil → email finance
- `LatencyMs` p95 > 8 s sur `/chat` → SNS oncall

---

## 5. IAM additions (Terraform)

Sur le task role API (ECS / Lambda) :

```hcl
statement {
  actions   = ["cloudwatch:PutMetricData"]
  resources = ["*"]
  condition {
    test     = "StringEquals"
    variable = "cloudwatch:namespace"
    values   = ["MP/Usage"]
  }
}
```

Sur le Lambda `cognito-post-auth` :
- réseau : si l'API est dans le VPC, attacher le Lambda au même VPC.
- env : `API_INTERNAL_URL`, `WEBHOOK_SECRET` (depuis Secrets Manager).

Sur le Lambda `secrets-rotation` :
- `secretsmanager:DescribeSecret`, `GetSecretValue`, `PutSecretValue`,
  `UpdateSecretVersionStage` sur `arn:aws:secretsmanager:*:*:secret:mp/ai/*`.
- attacher au secret via `aws_secretsmanager_secret_rotation` (30 jours).

---

## 6. Validation

| # | Test | Critère |
|---|---|---|
| 1 | Un chat consultant | `UsageEvent` créé en DB + métrique `CostUsd` visible CloudWatch < 1 min |
| 2 | Régler `Budget.monthlyUsd=0.01` pour un user, relancer un chat | Réponse HTTP 402 avec body `{error:"budget_exceeded"}` |
| 3 | Régler 1 $, atteindre 0.85 $ | Réponse OK + header `X-Budget-Warning` |
| 4 | Promouvoir un user en `MANAGER` via Cognito console | Au prochain login, `User.role` en DB = `MANAGER` (Lambda sync) |
| 5 | SuperAdmin clique « Rotater » Mistral, écrit nouvelle clé | `AWSPENDING` créé → Lambda promeut en `AWSCURRENT` → chat OK |

---

## 7. Hors scope (Vague 3)

- Step Functions pour orchestrer l'ingestion lourde
- X-Ray instrumentation bout-en-bout
- Quotas tokens/min (rate-limit) en complément du budget mensuel
- Multi-tenant org billing exports (Stripe / facturation)
