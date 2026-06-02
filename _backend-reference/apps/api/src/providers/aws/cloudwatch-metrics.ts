/**
 * Thin CloudWatch metrics publisher used by usageTrackingService.
 *
 * - Namespace: `MP/Usage` (overridable via CLOUDWATCH_NAMESPACE).
 * - Dimensions: provider, model, role, orgId, route — keep cardinality low.
 * - When AWS_REGION is missing we no-op silently (local dev).
 *
 * Metrics emitted:
 *   - TokensInput / TokensOutput (Count)
 *   - CostUsd (None, value=USD)
 *   - LatencyMs (Milliseconds)
 *   - BudgetExceeded (Count, value=1 on block)
 */
import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";

const NAMESPACE = process.env.CLOUDWATCH_NAMESPACE ?? "MP/Usage";

let client: CloudWatchClient | null = null;
function getClient(): CloudWatchClient | null {
  if (!process.env.AWS_REGION) return null;
  if (!client) client = new CloudWatchClient({ region: process.env.AWS_REGION });
  return client;
}

export interface UsageMetricDimensions {
  provider: string;
  model: string;
  role: string;
  orgId?: string;
  route?: string;
}

export interface UsageMetricValues {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  budgetExceeded?: boolean;
}

function toDims(d: UsageMetricDimensions) {
  return Object.entries(d)
    .filter(([, v]) => v != null && v !== "")
    .map(([Name, Value]) => ({ Name, Value: String(Value) }));
}

export async function publishUsageMetric(
  dims: UsageMetricDimensions,
  values: UsageMetricValues,
): Promise<void> {
  const cw = getClient();
  if (!cw) return;
  const Dimensions = toDims(dims);
  const data: MetricDatum[] = [];
  const push = (MetricName: string, Value: number, Unit: StandardUnit) => {
    if (Value == null || Number.isNaN(Value)) return;
    data.push({ MetricName, Value, Unit, Dimensions, Timestamp: new Date() });
  };
  if (values.inputTokens != null) push("TokensInput", values.inputTokens, StandardUnit.Count);
  if (values.outputTokens != null) push("TokensOutput", values.outputTokens, StandardUnit.Count);
  if (values.costUsd != null) push("CostUsd", values.costUsd, StandardUnit.None);
  if (values.latencyMs != null) push("LatencyMs", values.latencyMs, StandardUnit.Milliseconds);
  if (values.budgetExceeded) push("BudgetExceeded", 1, StandardUnit.Count);
  if (data.length === 0) return;
  try {
    await cw.send(new PutMetricDataCommand({ Namespace: NAMESPACE, MetricData: data }));
  } catch (err) {
    console.warn("[cloudwatch] publishUsageMetric failed", err);
  }
}
