# Wave 6 — Production hardening (internal app)

This wave bundles the post-Wave-5 items needed to run the assistant as a hardened internal product on AWS. Each sub-wave is independently deployable.

## 6.B — SuperAdmin AI keys UI ✅

- Frontend: `src/mp/components/AiProvidersAdmin.tsx`
- API contract:
  - `GET    /superadmin/ai-providers`
  - `POST   /superadmin/ai-providers`            `{ provider, apiKey, model?, configJson? }`
  - `POST   /superadmin/ai-providers/:p/test`    `{ ok, latencyMs }`
  - `PATCH  /superadmin/ai-providers/:p/rotate`  `{ apiKey, model?, configJson? }`
  - `GET    /superadmin/ai-providers/:p/history` `{ events: RotationEvent[] }`
  - `DELETE /superadmin/ai-providers/:p`
- Backend: `apps/api/src/services/aiProviderService.ts` (already in place).

## 6.E — LLM response cache (DynamoDB)

### What

A content-addressed cache keyed by `sha256(provider | model | promptVersion | tools | normalizedQuestion | filters | topK | retrievalSignature)`. Hits return the cached answer + sources without calling Bedrock, saving cost and latency.

### Files

- `apps/api/src/services/llmCache.ts` — `LlmCache.buildKey()` / `get()` / `set()` / `shouldBypass()`.
- `infra/aws/dynamodb-llm-cache.tf` — `MpLlmCache` table, on-demand billing, 7-day TTL, PITR, KMS.

### Wiring into the chat handler

```ts
// apps/api/src/routes/chat.ts (pseudo)
const key = LlmCache.buildKey({
  provider: model.provider,
  model: model.id,
  promptVersionId,
  tools: [],
  question,
  filters,
  topK: settings.topK,
  retrievalSignature: chunks.map((c) => c.id).sort().join(","),
});

const bypass = LlmCache.shouldBypass({
  cacheControl: req.headers["cache-control"],
  question,
  temperature: settings.temperature,
});

if (!bypass) {
  const hit = await llmCache.get(key);
  if (hit) {
    // emit a 0-token usage row so dashboards still count the request
    return { ...hit.payload, cache: { hit: true, key, ageSeconds: hit.ageSeconds } };
  }
}

const fresh = await runLlmAndRetrieve(...);

if (!bypass) await llmCache.set(key, fresh);
return { ...fresh, cache: { hit: false, key, ageSeconds: 0 } };
```

### Response shape (frontend contract)

```ts
interface ChatAnswerPayload {
  answer: string;
  sources: Array<{ chunkId: string; documentId: string; score: number; snippet: string }>;
  usage: { inputTokens: number; outputTokens: number; estimatedCost: number };
  model: string;
  provider: string;
  cache?: { hit: boolean; key: string; ageSeconds: number };
}
```

The frontend already renders a "Cache hit · 12s" badge when `cache.hit === true` (see `ChatShell.tsx`).

### Bypass rules

- Header `Cache-Control: no-store`
- Question contains volatile tokens (`today`, `now`, `yesterday`, `tomorrow`, `aujourd'hui`, `hier`, `demain`, `maintenant`)
- `temperature > 0.3`
- PII detected (handled upstream by `piiRedactor`)

### Cost projection (eu-west-3, on-demand)

| Workload (req/day) | Hit rate | DynamoDB cost / mo | Bedrock savings / mo |
| ------------------ | -------- | ------------------ | -------------------- |
| 10k                | 25 %     | < $1               | ~$30                 |
| 100k               | 30 %     | ~$5                | ~$350                |
| 500k               | 35 %     | ~$25               | ~$2 000              |

### Cache hit-rate monitoring

Add a CloudWatch metric in `apps/api/src/middleware/llmCacheMetrics.ts`:

```ts
cw.putMetricData({
  Namespace: "Mp/LlmCache",
  MetricData: [
    { MetricName: "Hits", Value: hit ? 1 : 0, Unit: "Count" },
    { MetricName: "BytesSaved", Value: hit ? approxBytes : 0, Unit: "Bytes" },
  ],
});
```

The `/me/usage` endpoint should also surface `cacheHitRate` so the Usage Dashboard renders the existing "Cache" tile.

## Next sub-waves

- **6.D** — SSE chat streaming (server route under `src/routes/api/chat/stream.ts`)
- **6.J** — RGPD light (`/me/export`, `/me` DELETE, audit purge)
- **6.C** — KB hybrid search (BM25 + kNN) + reindex SFN
- **6.F** — Sentry front + traceId propagation
- **6.G** — `/healthz` + ECS auto-scaling `min=2/max=20`

---

## Wave 6.D — Streaming SSE chat (IMPLÉMENTÉ côté front, mock)

**Endpoint à exposer côté Fastify** :
`POST /chat/conversations/:id/messages/stream` → `text/event-stream`

Frames émises (voir `_backend-reference/apps/api/src/routes/chat.stream.ts`) :
- `event: start`   `data: { conversationId }`
- `event: sources` `data: { sources: SourceCitation[] }`
- `event: token`   `data: { delta: string }`
- `event: done`    `data: ChatAnswerPayload`
- `event: error`   `data: { message: string }`
- comment `: ping` toutes les 15 s (heartbeat anti-timeout ALB).

**Front** : `ApiClient.streamChat()` (`src/mp/api.ts`) parse ce flux et émet
des `StreamEvent` consommés par `ChatShell.send()`. En mode `VITE_USE_MOCKS=true`,
le client simule le stream à ~12 ms/token à partir de `buildAnswerForStream`.

**Infra AWS — points critiques** :
- ALB : `idle_timeout = 120s` minimum, désactiver compression sur `text/event-stream`.
- CloudFront (si exposé) : whitelister header `Accept`, désactiver le cache sur
  `/chat/*/messages/stream`, `Origin Read Timeout = 60s`.
- ECS task : `responseTimeout` Fastify augmenté à 120 s pour ces routes.
- Cache LLM (Wave 6.E) : sur HIT, on émet un seul `token` avec l'answer complète
  pour conserver le contrat SSE.

**UX livré côté front** :
- Bulle assistant qui se remplit progressivement (caret clignotant).
- Bouton Stop (AbortController) qui interrompt le flux côté client.
- Sources rendues dès `event: sources` (rail latéral live).

---

## Wave 6.F — Sentry front + traceId (IMPLÉMENTÉ)

**Front** (`src/lib/observability.ts`) :
- `initObservability()` activé dans `__root.tsx` (no-op si `VITE_SENTRY_DSN` absent).
- `newTraceId()` génère un ID 16 octets hex (compatible W3C trace-context) par requête.
- `ApiClient` (`src/mp/api.ts`) :
  - Envoie `X-Trace-Id` sur chaque appel HTTP.
  - Capture les erreurs HTTP via `captureApiError()` avec tag `traceId`.
  - Nouvelle classe `ApiError` (expose `traceId` + `status`).
- `AuthProvider` appelle `setObservabilityUser()` à chaque login/logout (corrélation user ↔ erreurs).
- `ChatShell` : le toast d'erreur affiche les 16 premiers caractères du traceId (support L1 le copie-colle dans Sentry/CloudWatch).

**Backend à brancher** (`_backend-reference/apps/api/src/plugins/traceId.ts`) :
- `onRequest` hook reprend `X-Trace-Id` (ou en génère un), l'attache à pino + Sentry scope, le renvoie en réponse.
- À enregistrer **avant** `requireAuth` pour avoir le traceId sur les 401 aussi.

**Env vars Vite** (à pousser via CI) :
```
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/yyy
VITE_ENV=prod
VITE_RELEASE=<git-sha>
```

---

## Wave 6.G — /healthz + ECS auto-scaling

- `_backend-reference/apps/api/src/routes/health.ts` : `/healthz` (liveness, 200 systématique) + `/readyz` (PG + OpenSearch + Dynamo, 503 si dégradé). **Aucune auth.**
- `_backend-reference/infra/aws/ecs-autoscaling.tf` :
  - min=2 (HA inter-AZ), max=20.
  - Target tracking : CPU 60% + ALB 200 req/min/task.
  - Scale-out cooldown 60 s, scale-in 300 s (anti-flap pendant les SSE longs).
- ALB target group : `health_check.path = "/healthz"`, interval 15 s, threshold 2/3.

---

## Wave 6.I — FinOps tagging + AWS Budgets

- `_backend-reference/infra/aws/finops-tags.tf` : `default_tags` sur le provider AWS (Project, Environment, Owner, CostCenter, DataClass, Compliance). **À activer manuellement** dans Billing → Cost Allocation Tags après 1er deploy.
- `_backend-reference/infra/aws/aws-budgets.tf` : 3 budgets (global 1500 €/mois, Bedrock 40%, OpenSearch 30%) avec notifs SNS → email à 50/80/100%.
- Couplage applicatif : la logique de cut-off per-user reste dans `services/budgets.ts` (Wave 5) — AWS Budgets ne fait que l'alerte infra.
