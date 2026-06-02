/**
 * Daily Stripe metered billing export.
 *
 * Triggered by EventBridge cron at 02:00 UTC (cf. Terraform). Aggregates the
 * previous day's UsageEvent rows per org × meter (chat-tokens, embed-tokens,
 * ocr-pages, transcribe-minutes) and reports usage to Stripe.
 *
 * Idempotency: Stripe accepts a `Idempotency-Key`; we use
 * `mp-usage-${orgId}-${meter}-${YYYYMMDD}` so re-runs never double-bill.
 */
import Stripe from "stripe";

export interface BillingRepo {
  /** Aggregates UsageEvent for [from, to) grouped by (orgId, meter). */
  aggregateForBilling(from: Date, to: Date): Promise<BillingRow[]>;
  /** orgId → Stripe subscription item id per meter. */
  getStripeItems(orgId: string): Promise<Record<Meter, string | undefined>>;
}

export type Meter = "chat-tokens" | "embed-tokens" | "ocr-pages" | "transcribe-minutes";

export interface BillingRow {
  orgId: string;
  meter: Meter;
  quantity: number; // tokens, pages or minutes
}

function deriveMeter(route: string, provider: string): Meter | null {
  if (route.includes("textract")) return "ocr-pages";
  if (route.includes("transcribe")) return "transcribe-minutes";
  if (route.includes("embed") || provider.includes("embed")) return "embed-tokens";
  if (route.startsWith("POST /chat")) return "chat-tokens";
  return null;
}

export function meterFor(route: string, provider: string): Meter | null {
  return deriveMeter(route, provider);
}

export class StripeBillingExporter {
  private readonly stripe: Stripe;
  constructor(private readonly repo: BillingRepo, secretKey = process.env.STRIPE_SECRET_KEY!) {
    this.stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
  }

  /** Export usage for the UTC day ending at `endOfDay` (exclusive). */
  async exportDay(endOfDay: Date): Promise<{ exported: number; skipped: number }> {
    const start = new Date(endOfDay);
    start.setUTCDate(start.getUTCDate() - 1);
    const rows = await this.repo.aggregateForBilling(start, endOfDay);
    const ymd = start.toISOString().slice(0, 10).replace(/-/g, "");

    let exported = 0;
    let skipped = 0;

    // Group rows by org so we only fetch Stripe item ids once.
    const byOrg = new Map<string, BillingRow[]>();
    for (const r of rows) {
      const list = byOrg.get(r.orgId) ?? [];
      list.push(r);
      byOrg.set(r.orgId, list);
    }

    for (const [orgId, orgRows] of byOrg) {
      const items = await this.repo.getStripeItems(orgId);
      for (const row of orgRows) {
        const itemId = items[row.meter];
        if (!itemId) {
          skipped += 1;
          continue;
        }
        await this.stripe.subscriptionItems.createUsageRecord(
          itemId,
          {
            quantity: Math.ceil(row.quantity),
            timestamp: Math.floor(start.getTime() / 1000),
            action: "set",
          },
          { idempotencyKey: `mp-usage-${orgId}-${row.meter}-${ymd}` },
        );
        exported += 1;
      }
    }

    return { exported, skipped };
  }
}
