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
 * The handler fetches the result, calls finalizeAsyncJob() to chunk + embed +
 * index, then updates the Document row with the final status (`PUBLISHED` if
 * the OCR confidence ≥ TEXTRACT_MIN_CONFIDENCE and text was extracted,
 * otherwise `NEEDS_REVIEW` — empty Textract output and Textract `FAILED` /
 * `PARTIAL_SUCCESS` always degrade to `NEEDS_REVIEW`).
 */
import { SqsConsumer } from "./sqs-consumer.js";
import { TextractProvider, type TextractResult } from "./textract.js";
import { TranscribeProvider } from "./transcribe.js";
import {
  finalizeAsyncJob,
  type IngestionJob,
  type IngestionDeps,
  type IngestionStatus,
} from "../../ingestionPipeline.js";

export interface CallbackDeps extends IngestionDeps {
  textract: TextractProvider;
  transcribe: TranscribeProvider;
  /** Load the original ingestion job from the DB by externalJobId. */
  loadJob(externalJobId: string): Promise<IngestionJob | null>;
  /**
   * Persist the final outcome. Called once per callback with the resolved
   * text + the final status the worker decided on.
   */
  persist(
    job: IngestionJob,
    text: string,
    outcome: {
      status: IngestionStatus | "ERROR";
      engine: "textract" | "transcribe";
      confidence?: number;
      warnings?: string[];
    }
  ): Promise<void>;
  /** Optional structured logger. Defaults to console. */
  log?: { info: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void };
}

const DEFAULT_MIN_CONFIDENCE = Number(process.env.TEXTRACT_MIN_CONFIDENCE ?? 0.7);

export function startIngestionCallbackConsumer(
  consumer: SqsConsumer,
  deps: CallbackDeps
): Promise<void> {
  const log = deps.log ?? console;
  return consumer.run(async (_name, payload) => {
    const envelope =
      typeof payload === "string"
        ? JSON.parse(payload)
        : (payload as { Message?: string; detail?: unknown });
    const inner =
      typeof envelope.Message === "string" ? JSON.parse(envelope.Message) : envelope;

    // -------- Textract -----------------------------------------------------
    if (inner.JobId && inner.JobTag) {
      const docId: string = inner.JobTag;
      const job = await deps.loadJob(docId);
      if (!job) {
        log.info?.("[callback] textract job has no matching document", { docId });
        return;
      }

      let result: TextractResult;
      try {
        result = await deps.textract.fetchResult(inner.JobId);
      } catch (err) {
        log.error?.("[callback] textract fetchResult failed", err);
        await deps.persist(job, "", {
          status: "ERROR",
          engine: "textract",
          warnings: ["textract_fetch_failed"],
        });
        return;
      }

      if (result.status === "FAILED") {
        await deps.persist(job, "", {
          status: "NEEDS_REVIEW",
          engine: "textract",
          confidence: result.confidence,
          warnings: ["textract_failed"],
        });
        return;
      }

      const warnings: string[] = [];
      if (result.status === "PARTIAL_SUCCESS") warnings.push("textract_partial_success");
      if (!result.text.trim()) warnings.push("empty_extraction_requires_manual_review");
      if (result.confidence && result.confidence < DEFAULT_MIN_CONFIDENCE)
        warnings.push(`low_ocr_confidence:${result.confidence.toFixed(2)}`);

      if (result.text.trim()) {
        await finalizeAsyncJob(job, result.text, deps);
      }

      const status: IngestionStatus = warnings.length ? "NEEDS_REVIEW" : "PUBLISHED";
      await deps.persist(job, result.text, {
        status,
        engine: "textract",
        confidence: result.confidence,
        warnings,
      });
      return;
    }

    // -------- Transcribe (EventBridge → SQS) -------------------------------
    const detail = (inner as {
      detail?: { TranscriptionJobName?: string; TranscriptionJobStatus?: string };
    }).detail;
    if (detail?.TranscriptionJobName) {
      const externalId = detail.TranscriptionJobName;
      const job = await deps.loadJob(externalId);
      if (!job) return;
      const { status, text } = await deps.transcribe.fetchResult(externalId);
      if (status !== "COMPLETED") {
        await deps.persist(job, "", {
          status: "NEEDS_REVIEW",
          engine: "transcribe",
          warnings: [`transcribe_status_${status.toLowerCase()}`],
        });
        return;
      }
      if (text.trim()) await finalizeAsyncJob(job, text, deps);
      await deps.persist(job, text, {
        status: text.trim() ? "PUBLISHED" : "NEEDS_REVIEW",
        engine: "transcribe",
        warnings: text.trim() ? [] : ["empty_transcription"],
      });
    }
  });
}
