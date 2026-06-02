/**
 * Prisma-backed repository.
 *
 * Strategy: write-through cache. We extend AppRepository so all existing
 * `state.X.find/push` call sites keep working. On boot, hydrate state from
 * Postgres. Mutations go through wrapper methods that update the cache AND
 * persist to Prisma asynchronously.
 *
 * This file ships as a working seam. For each entity you want fully
 * Postgres-resident, replace the corresponding `state.X` access with a
 * Prisma query in the service that uses it (the read-through cache stays
 * valid for hot paths).
 */
import { AppRepository } from "../state.js";
import { PrismaClient } from "@prisma/client";
import type { AuditEvent } from "@mp/shared";

export class PrismaAppRepository extends AppRepository {
  private readonly prisma: PrismaClient;

  constructor() {
    super();
    this.prisma = new PrismaClient({ log: ["warn", "error"] });
  }

  async ready(): Promise<void> {
    await this.prisma.$connect();
    await this.hydrate();
    await super.ready();
  }

  /**
   * Hydrate the in-memory state from Postgres. Only entities present in the
   * Prisma schema are loaded; the rest fall back to the seed shape created
   * by `createDemoState()`.
   */
  private async hydrate(): Promise<void> {
    try {
      const [users, prompts, providerConfigs] = await Promise.all([
        this.prisma.user.findMany().catch(() => []),
        this.prisma.promptVersion.findMany().catch(() => []),
        this.prisma.aiProviderConfig.findMany().catch(() => []),
      ]);
      if (users.length) this.state.users = users as unknown as typeof this.state.users;
      if (prompts.length) this.state.prompts = prompts as unknown as typeof this.state.prompts;
      if (providerConfigs.length) this.state.providerConfigs = providerConfigs as unknown as typeof this.state.providerConfigs;
    } catch (err) {
      console.warn("Prisma hydration failed, continuing with seed state:", err);
    }
  }

  /**
   * Override audit so events are persisted to Postgres in addition to memory.
   * Mirrors super.audit() to keep behavior identical for non-Prisma callers.
   */
  audit(event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    const record = super.audit(event);
    this.prisma.auditEvent
      .create({ data: record as unknown as Record<string, unknown> })
      .catch((err) => console.error("audit persist failed:", err));
    return record;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
