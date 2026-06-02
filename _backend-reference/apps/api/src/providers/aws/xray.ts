/**
 * AWS X-Ray helper — captures subsegments around critical spans (DB, Bedrock,
 * AOSS, S3, Secrets Manager) and propagates trace IDs through HTTP responses.
 *
 * Activated when `AWS_XRAY_DAEMON_ADDRESS` is set (ECS/Lambda inject it).
 * In local dev `traceAsync` becomes a transparent passthrough.
 *
 * Usage:
 *   import { traceAsync, captureAwsClient } from "./providers/aws/xray";
 *   const bedrock = captureAwsClient(new BedrockRuntimeClient({}));
 *   await traceAsync("bedrock.embed", { model }, () => bedrock.send(cmd));
 */
import AWSXRay from "aws-xray-sdk-core";

const ENABLED = !!process.env.AWS_XRAY_DAEMON_ADDRESS;

if (ENABLED) {
  AWSXRay.middleware.setSamplingRules({
    version: 2,
    default: { fixed_target: 1, rate: 0.1 },
    rules: [
      { description: "chat", host: "*", http_method: "*", url_path: "/chat*", fixed_target: 5, rate: 1.0 },
      { description: "ingest", host: "*", http_method: "*", url_path: "/admin/kb/*", fixed_target: 2, rate: 0.5 },
    ],
  });
}

export async function traceAsync<T>(
  name: string,
  annotations: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return fn();
  const segment = AWSXRay.getSegment();
  if (!segment) return fn();
  const sub = segment.addNewSubsegment(name);
  for (const [k, v] of Object.entries(annotations)) sub.addAnnotation(k, v as never);
  try {
    const out = await fn();
    sub.close();
    return out;
  } catch (err) {
    sub.addError(err as Error);
    sub.close(err as Error);
    throw err;
  }
}

/** Wrap any AWS v3 client so its calls appear as subsegments automatically. */
export function captureAwsClient<T extends object>(client: T): T {
  if (!ENABLED) return client;
  return AWSXRay.captureAWSv3Client(client as never) as T;
}

/** Fastify plugin: open one segment per request, attach trace id to reply. */
export function xrayFastifyHook() {
  return async (req: { id: string; raw: { url?: string; method?: string } }, reply: { header: (k: string, v: string) => void }) => {
    if (!ENABLED) return;
    const segment = new AWSXRay.Segment("mp-api", undefined, undefined);
    segment.addAnnotation("requestId", req.id);
    segment.addAnnotation("route", `${req.raw.method ?? ""} ${req.raw.url ?? ""}`);
    reply.header("X-Amzn-Trace-Id", `Root=${segment.trace_id};Sampled=1`);
    AWSXRay.setSegment(segment);
  };
}
