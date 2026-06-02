import { ConsoleObservabilityProvider, InMemoryQueueProvider } from "./providers.js";
import { runIngestion, type IngestionJob } from "./ingestionPipeline.js";

const log = new ConsoleObservabilityProvider();
const queue = new InMemoryQueueProvider<IngestionJob>();

await queue.enqueue("document.ingest.sample", {
  documentId: "worker-sample",
  title: "Worker sample guidance",
  ownerId: "usr-superadmin",
  objectKey: "sample/worker-sample.md",
  mimeType: "text/markdown",
  rawText: "Sample worker ingestion document. Planning, risk management and PMO governance chunks are produced here.",
  version: 1
});

await queue.process(async (name, payload) => {
  log.info("worker_job_started", { name, documentId: payload.documentId });
  const result = await runIngestion(payload);
  log.info("worker_job_completed", {
    name,
    documentId: result.document.id,
    status: result.status,
    chunks: result.chunks.length,
    warnings: result.warnings
  });
});

log.info("worker_idle", { queueProvider: "InMemoryQueueProvider", awsReadyAlternative: "SQS/Lambda/EventBridge" });
