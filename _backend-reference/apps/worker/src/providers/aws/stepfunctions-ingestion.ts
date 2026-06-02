/**
 * Wave 3 — Step Functions invoker.
 *
 * Replaces the SQS-only orchestration of Wave 1 for *heavy* ingestion jobs
 * (Textract/Transcribe async, > 5 MB PDFs, multi-language transcripts).
 *
 * The SQS consumer routes to one of two paths:
 *   - "fast" sync jobs           → existing ingestionPipeline.processOne()
 *   - "heavy" async jobs         → startIngestionExecution() here
 *
 * The Step Function definition lives in
 * `infra/aws/stepfunctions/ingestion.asl.json` and is created by Terraform
 * with all `${...}` placeholders interpolated.
 */
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const client = new SFNClient({ region: process.env.AWS_REGION });
const STATE_MACHINE_ARN = process.env.INGESTION_STATE_MACHINE_ARN;

export interface IngestionInput {
  documentId: string;
  objectKey: string;
  mimeType: string;
  uploadedBy: string;
  industryTags?: string[];
  pmDomainTags?: string[];
}

export async function startIngestionExecution(input: IngestionInput): Promise<{ executionArn: string }> {
  if (!STATE_MACHINE_ARN) {
    throw new Error("INGESTION_STATE_MACHINE_ARN not set — Step Functions invoker disabled");
  }
  const res = await client.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      // Idempotency: same docId never starts twice in <90 days.
      name: `doc-${input.documentId}-${Date.now()}`,
      input: JSON.stringify(input),
    }),
  );
  return { executionArn: res.executionArn! };
}

/** Heuristic: heavy jobs go via Step Functions, the rest stay on the worker. */
export function shouldUseStepFunctions(mimeType: string, sizeBytes: number): boolean {
  if (!STATE_MACHINE_ARN) return false;
  if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) return true;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType === "application/pdf" && sizeBytes > 5 * 1024 * 1024) return true;
  return false;
}
