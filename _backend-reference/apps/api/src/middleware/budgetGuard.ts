/**
 * Fastify preHandler enforcing budgets before any AI-consuming route.
 *
 * Usage:
 *   fastify.post("/chat", { preHandler: [requireAuth, budgetGuard(budgetService)] }, handler);
 *
 * On block → 402 Payment Required with structured body so the UI can render a
 * "budget épuisé" state (see PromptAndModelSettings.tsx).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { BudgetExceededError, type BudgetService } from "../services/budgetService";

export function budgetGuard(budgets: BudgetService) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (req as FastifyRequest & { user?: { sub: string; role: string; orgId?: string | null } }).user;
    if (!user) return; // requireAuth runs first; this is a no-op if missing.
    try {
      const status = await budgets.assertWithin({ userId: user.sub, role: user.role, orgId: user.orgId ?? null });
      if (status?.level === "warn") {
        reply.header("X-Budget-Warning", `spent=${status.spentUsd.toFixed(2)};limit=${status.rule.monthlyUsd}`);
      }
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        reply.code(err.httpStatus).send({
          error: "budget_exceeded",
          message: err.message,
          spentUsd: err.status.spentUsd,
          limitUsd: err.status.rule.monthlyUsd,
          windowStart: err.status.windowStart.toISOString(),
          windowEnd: err.status.windowEnd.toISOString(),
        });
        return;
      }
      throw err;
    }
  };
}
