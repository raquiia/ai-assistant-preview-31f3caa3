/**
 * Worker bootstrap.
 *
 * - Local mode (no AWS_REGION): runs the in-memory sample job so the dev
 *   experience matches the rest of the monorepo without any cloud setup.
 * - AWS mode (AWS_REGION + SQS_INGESTION_QUEUE_URL set): starts two long-poll
 *   SQS consumers in parallel:
 *     1) the main ingestion queue (S3 upload events → runIngestion)
 *     2) the Textract/Transcribe callback queue → startIngestionCallbackConsumer
 */
import { ConsoleObservabilityProvider, InMemoryQueueProvider } from "./providers.js";
import { runIngestion, type IngestionJob } from "./ingestionPipeline.js";
import { SqsConsumer } from "./providers/aws/sqs-consumer.js";
import { startIngestionCallbackConsumer } from "./providers/aws/ingestion-callback.js";
import { TextractProvider } from "./providers/aws/textract.js";
import { TranscribeProvider } from "./providers/aws/transcribe.js";

const log = new ConsoleObservabilityProvider();

const region = process.env.AWS_REGION;
const ingestionQueueUrl = process.env.SQS_INGESTION_QUEUE_URL;
const callbackQueueUrl = process.env.SQS_INGESTION_CALLBACK_URL;

if (!region || !ingestionQueueUrl) {
  // ── Local fallback ─────────────────────────────────────────────────────
  const queue = new InMemoryQueueProvider<IngestionJob>();

  await queue.enqueue("document.ingest.sample", {
    documentId: "worker-sample",
    title: "Worker sample guidance",
    ownerId: "usr-superadmin",
    objectKey: "sample/worker-sample.md",
    mimeType: "text/markdown",
    rawText:
      "Sample worker ingestion document. Planning, risk management and PMO governance chunks are produced here.",
    version: 1,
  });

  await queue.process(async (name, payload) => {
    log.info("worker_job_started", { name, documentId: payload.documentId });
    const result = await runIngestion(payload);
    log.info("worker_job_completed", {
      name,
      documentId: result.document.id,
      status: result.status,
      chunks: result.chunks.length,
      warnings: result.warnings,
    });
  });

  log.info("worker_idle", {
    queueProvider: "InMemoryQueueProvider",
    awsReadyAlternative: "SQS/Lambda/EventBridge",
  });
} else {
  // ── AWS mode ──────────────────────────────────────────────────────────
  log.info("worker_aws_mode", { region, ingestionQueueUrl, callbackQueueUrl });

  // Wire providers + repository here. In real prod we instantiate
  // PrismaAppRepository and pass it through `markProcessing` /
  // `loadJob` / `persist` for the callback consumer.
  // Keeping the import lazy avoids pulling Prisma into local runs.
  const { PrismaAppRepository } = await import("../../api/src/repository/prisma-repo.js");
  const repo = new PrismaAppRepository();
  await repo.ready();

  const textract = new TextractProvider({
    region,
    snsTopicArn: process.env.TEXTRACT_SNS_TOPIC_ARN,
    snsRoleArn: process.env.TEXTRACT_ROLE_ARN,
  });
  const transcribe = new TranscribeProvider({ region });

  const sharedDeps = {
    textract,
    transcribe,
    markProcessing: (id: string, jobId: string, engine: "textract" | "transcribe") =>
      repo.markDocumentProcessing(id, jobId, engine),
  };

  // 1) Main ingestion queue.
  const ingestionConsumer = new SqsConsumer({ region, queueUrl: ingestionQueueUrl });
  const ingestionLoop = ingestionConsumer.run(async (name, payload) => {
    const job = payload as IngestionJob;
    log.info("ingestion_job_started", { name, documentId: job.documentId });
    const result = await runIngestion(job, sharedDeps);
    log.info("ingestion_job_completed", {
      name,
      documentId: job.documentId,
      status: result.status,
      externalJobId: result.externalJobId,
      chunks: result.chunks.length,
    });
  });

  // 2) Textract / Transcribe callback queue.
  let callbackLoop: Promise<void> = Promise.resolve();
  if (callbackQueueUrl) {
    const callbackConsumer = new SqsConsumer({
      region,
      queueUrl: callbackQueueUrl,
      visibilityTimeoutSeconds: 900,
    });
    callbackLoop = startIngestionCallbackConsumer(callbackConsumer, {
      ...sharedDeps,
      loadJob: async (externalJobId) => {
        const doc = await repo.findDocumentByExternalJobId(externalJobId);
        if (!doc) return null;
        return {
          documentId: doc.id,
          title: doc.title,
          ownerId: doc.ownerId,
          objectKey: doc.objectKey,
          mimeType: doc.mimeType,
          version: doc.version,
        };
      },
      persist: async (job, _text, outcome) => {
        await repo.updateDocumentExtraction(job.documentId, {
          status: outcome.status,
          confidence: outcome.confidence,
          warnings: outcome.warnings,
        });
        log.info("callback_persisted", {
          documentId: job.documentId,
          status: outcome.status,
          engine: outcome.engine,
          confidence: outcome.confidence,
        });
      },
      log: { info: (m, x) => log.info(m, x as Record<string, unknown>), error: (m, x) => log.error(m, x as Record<string, unknown>) },
    });
  } else {
    log.info("worker_callback_disabled", { reason: "SQS_INGESTION_CALLBACK_URL is not set" });
  }

  await Promise.all([ingestionLoop, callbackLoop]);
}
