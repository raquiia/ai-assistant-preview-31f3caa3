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
