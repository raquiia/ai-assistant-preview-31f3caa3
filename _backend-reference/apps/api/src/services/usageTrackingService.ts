/**
 * UsageTrackingService — records token consumption + USD cost for every AI call
 * (chat, embeddings, search, OCR, transcription) and forwards aggregated metrics
 * to CloudWatch.
 *
 * Persistence: writes a `UsageEvent` row in DB (Prisma) for fine-grained
 * billing/reporting; CloudWatch is for dashboards + alarms only.
 *
 * Call sites:
 *   - chatService → recordChatUsage()
 *   - bedrock-embeddings (worker) → recordEmbeddingUsage()
 *   - textract / transcribe → recordExtractionUsage()
 *
 * Pair with BudgetService.checkAndIncrement() to enforce limits.
 */
import { randomUUID } from "node:crypto";
import { computeCost, type CostInput, type CostBreakdown } from "./pricing";
import { publishUsageMetric } from "../providers/aws/cloudwatch-metrics";

export interface UsageRepo {
  insertEvent(event: UsageEvent): Promise<void>;
  sumCostSince(filters: { userId?: string; orgId?: string; since: Date }): Promise<number>;
  sumTokensSince(filters: { userId?: string; orgId?: string; since: Date }): Promise<number>;
}

export interface UsageEvent {
  id: string;
  createdAt: Date;
  userId: string;
  orgId?: string | null;
  role: string;
  route: string; // e.g. "POST /chat", "worker:embed", "worker:textract"
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  units: number;
  costUsd: number;
  latencyMs?: number;
  requestId?: string;
}

export interface RecordParams {
  userId: string;
  orgId?: string | null;
  role: string;
  route: string;
  latencyMs?: number;
  requestId?: string;
}

export class UsageTrackingService {
  constructor(private readonly repo: UsageRepo) {}

  async record(cost: CostInput, ctx: RecordParams): Promise<{ event: UsageEvent; cost: CostBreakdown }> {
    const breakdown = computeCost(cost);
    const event: UsageEvent = {
      id: randomUUID(),
      createdAt: new Date(),
      userId: ctx.userId,
      orgId: ctx.orgId ?? null,
      role: ctx.role,
      route: ctx.route,
      provider: cost.provider,
      model: cost.model,
      inputTokens: cost.inputTokens ?? 0,
      outputTokens: cost.outputTokens ?? 0,
      units: cost.units ?? 0,
      costUsd: breakdown.totalUsd,
      latencyMs: ctx.latencyMs,
      requestId: ctx.requestId,
    };

    // Persist (DB) and publish (CloudWatch) in parallel; never let metrics fail the request.
    await Promise.allSettled([
      this.repo.insertEvent(event),
      publishUsageMetric(
        {
          provider: cost.provider,
          model: cost.model,
          role: ctx.role,
          orgId: ctx.orgId ?? undefined,
          route: ctx.route,
        },
        {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          costUsd: event.costUsd,
          latencyMs: ctx.latencyMs,
        },
      ),
    ]);

    return { event, cost: breakdown };
  }

  costSince(filters: { userId?: string; orgId?: string; since: Date }): Promise<number> {
    return this.repo.sumCostSince(filters);
  }

  tokensSince(filters: { userId?: string; orgId?: string; since: Date }): Promise<number> {
    return this.repo.sumTokensSince(filters);
  }
}
