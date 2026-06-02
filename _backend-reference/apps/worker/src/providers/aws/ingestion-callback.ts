/**
 * Callback handler for async Textract / Transcribe jobs.
 *
 * Subscribes to a second SQS queue fed by SNS (Textract `NotificationChannel`
 * and an EventBridge rule for Transcribe `Transcribe Job State Change`).
 *
 * Message shape (after SNS → SQS):
 *   {
 *     "Type": "Notification",
 *     "Message": "{...}"   // stringified JSON below
 *   }
 *
 *   Textract: { JobId, Status, DocumentLocation: { S3ObjectName }, JobTag (= documentId) }
 *   Transcribe (EventBridge): { detail: { TranscriptionJobName, TranscriptionJobStatus } }
 *
 * The handler fetches the result, calls finalizeAsyncJob(), then updates the
 * Document row in the DB with the final status (`PUBLISHED` / `NEEDS_REVIEW`).
 */
import { SqsConsumer } from "./sqs-consumer.js";
import { TextractProvider } from "./textract.js";
import { TranscribeProvider } from "./transcribe.js";
import { finalizeAsyncJob, type IngestionJob, type IngestionDeps } from "../../ingestionPipeline.js";

export interface CallbackDeps extends IngestionDeps {
  textract: TextractProvider;
  transcribe: TranscribeProvider;
  /** Load the original ingestion job from the DB by documentId / externalJobId. */
  loadJob(externalJobId: string): Promise<IngestionJob | null>;
  /** Persist the final outcome (status + chunks). */
  persist(job: IngestionJob, text: string): Promise<void>;
}

export function startIngestionCallbackConsumer(
  consumer: SqsConsumer,
  deps: CallbackDeps
): Promise<void> {
  return consumer.run(async (_name, payload) => {
    const envelope = typeof payload === "string" ? JSON.parse(payload) : (payload as { Message?: string; detail?: unknown });
    const inner =
      typeof envelope.Message === "string" ? JSON.parse(envelope.Message) : envelope;

    // Textract
    if (inner.JobId && inner.JobTag) {
      const docId: string = inner.JobTag;
      const job = await deps.loadJob(docId);
      if (!job) return;
      const { status, text } = await deps.textract.fetchResult(inner.JobId);
      if (status !== "SUCCEEDED") return;
      await finalizeAsyncJob(job, text, deps);
      await deps.persist(job, text);
      return;
    }

    // Transcribe (EventBridge → SQS)
    const detail = (inner as { detail?: { TranscriptionJobName?: string; TranscriptionJobStatus?: string } }).detail;
    if (detail?.TranscriptionJobName) {
      const externalId = detail.TranscriptionJobName;
      const job = await deps.loadJob(externalId);
      if (!job) return;
      const { status, text } = await deps.transcribe.fetchResult(externalId);
      if (status !== "COMPLETED") return;
      await finalizeAsyncJob(job, text, deps);
      await deps.persist(job, text);
    }
  });
}
