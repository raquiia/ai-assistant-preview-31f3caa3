/**
 * BudgetService — enforces per-user and per-org monthly USD budgets on AI
 * consumption, with soft warnings + hard cutoff.
 *
 * Resolution priority (highest → lowest):
 *   1. User override        (Budget row with userId set)
 *   2. Role default         (Budget row with role set, userId null)
 *   3. Org default          (Budget row with orgId set, userId null)
 *   4. Global env defaults  (BUDGET_DEFAULT_<ROLE>_USD)
 *
 * Window: rolling calendar month (UTC, 1st 00:00 → next 1st 00:00).
 *
 * Wire-up:
 *   - Fastify preHandler `budgetGuard` calls `assertWithin()` BEFORE invoking
 *     an LLM. Returns 402 Payment Required (or 429) when over the hard cap.
 *   - After the call, the route invokes `usageTracking.record()` which is the
 *     authoritative ledger; budgets are read from it.
 */
import type { UsageTrackingService } from "./usageTrackingService";

export interface BudgetRule {
  id: string;
  scope: "user" | "role" | "org" | "global";
  userId?: string | null;
  orgId?: string | null;
  role?: string | null;
  monthlyUsd: number;
  softRatio: number; // e.g. 0.8 → warn at 80%
  hardRatio: number; // e.g. 1.0 → block at 100%
}

export interface BudgetRepo {
  findApplicable(ctx: { userId: string; orgId?: string | null; role: string }): Promise<BudgetRule | null>;
}

export interface BudgetStatus {
  rule: BudgetRule;
  spentUsd: number;
  remainingUsd: number;
  windowStart: Date;
  windowEnd: Date;
  level: "ok" | "warn" | "blocked";
}

function monthWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function envDefault(role: string): number | null {
  const raw = process.env[`BUDGET_DEFAULT_${role.toUpperCase()}_USD`];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly status: BudgetStatus,
    public readonly httpStatus: 402 | 429 = 402,
  ) {
    super(
      `Budget exceeded for ${status.rule.scope}=${status.rule.userId ?? status.rule.role ?? status.rule.orgId ?? "global"}: spent $${status.spentUsd.toFixed(2)} / $${status.rule.monthlyUsd.toFixed(2)}`,
    );
  }
}

export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepo,
    private readonly usage: UsageTrackingService,
  ) {}

  private async resolveRule(ctx: { userId: string; orgId?: string | null; role: string }): Promise<BudgetRule | null> {
    const dbRule = await this.budgets.findApplicable(ctx);
    if (dbRule) return dbRule;
    const fallback = envDefault(ctx.role);
    if (fallback == null) return null;
    return {
      id: `env:${ctx.role}`,
      scope: "role",
      role: ctx.role,
      monthlyUsd: fallback,
      softRatio: 0.8,
      hardRatio: 1.0,
    };
  }

  async getStatus(ctx: { userId: string; orgId?: string | null; role: string }): Promise<BudgetStatus | null> {
    const rule = await this.resolveRule(ctx);
    if (!rule) return null;
    const { start, end } = monthWindow();
    const spent = await this.usage.costSince({
      userId: rule.scope === "user" ? ctx.userId : undefined,
      orgId: rule.scope === "org" ? ctx.orgId ?? undefined : undefined,
      since: start,
    });
    const remaining = Math.max(0, rule.monthlyUsd - spent);
    const ratio = spent / rule.monthlyUsd;
    const level: BudgetStatus["level"] =
      ratio >= rule.hardRatio ? "blocked" : ratio >= rule.softRatio ? "warn" : "ok";
    return { rule, spentUsd: spent, remainingUsd: remaining, windowStart: start, windowEnd: end, level };
  }

  /**
   * Throws BudgetExceededError when the caller would be over the hard cap.
   * Call BEFORE invoking the LLM. The actual cost is recorded post-call by
   * UsageTrackingService.record().
   */
  async assertWithin(ctx: { userId: string; orgId?: string | null; role: string }): Promise<BudgetStatus | null> {
    const status = await this.getStatus(ctx);
    if (status && status.level === "blocked") throw new BudgetExceededError(status);
    return status;
  }
}
