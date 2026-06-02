/**
 * EventBridge-scheduled Lambda — daily Stripe usage export.
 * Cron: `cron(0 2 * * ? *)` (02:00 UTC).
 */
import { StripeBillingExporter } from "../../api/src/services/stripeBillingExporter";
import { prismaBillingRepo } from "./prismaBillingRepo"; // adapter — implements BillingRepo via Prisma

export const handler = async (): Promise<{ exported: number; skipped: number }> => {
  const exporter = new StripeBillingExporter(prismaBillingRepo);
  const endOfDay = new Date();
  endOfDay.setUTCHours(0, 0, 0, 0); // today 00:00 UTC — exports yesterday
  const result = await exporter.exportDay(endOfDay);
  console.log("[billing-export] done", result);
  return result;
};
