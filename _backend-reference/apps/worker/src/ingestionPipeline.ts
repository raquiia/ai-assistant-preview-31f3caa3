/**
 * Real ingestion pipeline — selects an extractor based on MIME type,
 * chunks the text, generates embeddings, and indexes into OpenSearch.
 *
 * Sync paths (returned PUBLISHED in one pass):
 *   - text/* and text/markdown  → S3 GetObject + utf8
 *   - application/pdf (native)  → pdf-parse
 *   - .docx                     → mammoth
 *   - .pptx                     → pptx-text-parser
 *
 * Async paths (returned PROCESSING, completed by callback handler):
 *   - application/pdf (scanned), image/*  → Textract StartDocumentTextDetection
 *   - audio/*, video/*                    → Transcribe StartTranscriptionJob
 *
 * The async branch persists `Document { status: PROCESSING, externalJobId }`
 * and the callback (SNS → SQS → worker) resumes via `finalizeAsyncJob()`.
 */
import { chunkDocument } from "@mp/rag";
import {
  detectLanguage,
  isAllowedUploadMimeType,
  type DocumentChunk,
  type DocumentRecord,
} from "@mp/shared";
import { S3StorageProvider } from "../../api/src/providers/aws/s3-storage.js";
import { BedrockEmbeddingsProvider } from "./providers/aws/bedrock-embeddings.js";
import { TextractProvider } from "./providers/aws/textract.js";
import { TranscribeProvider } from "./providers/aws/transcribe.js";
import type { OpenSearchVectorProvider } from "../../api/src/providers/aws/opensearch-vector.js";

export interface IngestionJob {
  documentId: string;
  title: string;
  ownerId: string;
  objectKey: string;
  mimeType: string;
  rawText?: string;
  version?: number;
  industryTags?: string[];
  pmDomainTags?: string[];
}

export interface IngestionDeps {
  storage?: S3StorageProvider;
  embeddings?: BedrockEmbeddingsProvider;
  vector?: OpenSearchVectorProvider;
  textract?: TextractProvider;
  transcribe?: TranscribeProvider;
}

export type IngestionStatus = "PUBLISHED" | "NEEDS_REVIEW" | "PROCESSING";

export interface IngestionResult {
  document: DocumentRecord;
  chunks: DocumentChunk[];
  status: IngestionStatus;
  warnings: string[];
  externalJobId?: string;
}

export async function runIngestion(job: IngestionJob, deps: IngestionDeps = {}): Promise<IngestionResult> {
  if (!isAllowedUploadMimeType(job.mimeType)) throw new Error(`Unsupported mime type: ${job.mimeType}`);
  const warnings: string[] = [];

  // 1) Try to extract synchronously, or hand off to async service.
  const sync = await extractSync(job, deps);
  if (sync.async) {
    const document = baseDocument(job, "", "PROCESSING");
    return { document, chunks: [], status: "PROCESSING", warnings, externalJobId: sync.externalJobId };
  }

  const text = sync.text ?? job.rawText ?? "";
  if (!text.trim()) warnings.push("empty_extraction_requires_manual_review");

  const status: IngestionStatus = warnings.length ? "NEEDS_REVIEW" : "PUBLISHED";
  const language = detectLanguage(text || job.title, "fr");
  const document = baseDocument(job, text, status, language);

  const chunks = chunkDocument({
    documentId: document.id,
    title: document.title,
    version: document.version,
    text: text || `Document ${document.title} en attente d'extraction.`,
    language,
  });

  // 2) Embed + index if a vector store is wired.
  if (deps.embeddings && deps.vector && chunks.length && status === "PUBLISHED") {
    const vectors = await deps.embeddings.embedBatch(chunks.map((c) => c.text));
    await deps.vector.upsertChunks(
      chunks.map((c, i) => ({
        chunkId: c.id,
        documentId: document.id,
        title: document.title,
        text: c.text,
        embedding: vectors[i],
        page: c.page,
        section: c.section,
        language,
        industryTags: job.industryTags,
        pmDomainTags: job.pmDomainTags,
      }))
    );
  }

  return { document, chunks, status, warnings };
}

/**
 * Resume an async ingestion job after Textract/Transcribe completes.
 * Called by the SQS callback consumer.
 */
export async function finalizeAsyncJob(
  job: IngestionJob,
  extractedText: string,
  deps: IngestionDeps
): Promise<IngestionResult> {
  return runIngestion({ ...job, rawText: extractedText }, deps);
}

interface SyncExtractionResult {
  text?: string;
  async?: boolean;
  externalJobId?: string;
}

async function extractSync(job: IngestionJob, deps: IngestionDeps): Promise<SyncExtractionResult> {
  if (job.rawText) return { text: job.rawText };

  // Plain text / markdown → fetch direct from S3.
  if (job.mimeType.startsWith("text/")) {
    if (!deps.storage) return { text: "" };
    const buf = await deps.storage.getObject(job.objectKey);
    return { text: buf.toString("utf8") };
  }

  // PDF: try native first; if it returns empty (scanned), hand off to Textract.
  if (job.mimeType === "application/pdf") {
    if (deps.storage) {
      try {
        const buf = await deps.storage.getObject(job.objectKey);
        // Dynamic import avoids loading pdf-parse when the worker isn't using it.
        const { default: pdfParse } = await import("pdf-parse");
        const parsed = await pdfParse(buf);
        if (parsed.text?.trim()) return { text: parsed.text };
      } catch (err) {
        console.warn("[ingestion] pdf-parse failed, falling back to Textract:", err);
      }
    }
    if (deps.textract && deps.storage) {
      const bucket = process.env.S3_KNOWLEDGE_BUCKET!;
      const { jobId } = await deps.textract.startJob(bucket, job.objectKey, job.documentId);
      return { async: true, externalJobId: jobId };
    }
    return { text: "" };
  }

  // DOCX
  if (job.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (!deps.storage) return { text: "" };
    const buf = await deps.storage.getObject(job.objectKey);
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer: buf });
    return { text: out.value };
  }

  // PPTX
  if (job.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    if (!deps.storage) return { text: "" };
    const buf = await deps.storage.getObject(job.objectKey);
    try {
      const { extractRawText } = await import("pptx-text-parser");
      const text = await extractRawText(buf);
      return { text };
    } catch (err) {
      console.warn("[ingestion] pptx-text-parser failed:", err);
      return { text: "" };
    }
  }

  // Images → Textract
  if (job.mimeType.startsWith("image/")) {
    if (!deps.textract || !deps.storage) return { text: "" };
    const bucket = process.env.S3_KNOWLEDGE_BUCKET!;
    const { jobId } = await deps.textract.startJob(bucket, job.objectKey, job.documentId);
    return { async: true, externalJobId: jobId };
  }

  // Audio/Video → Transcribe
  if (job.mimeType.startsWith("audio/") || job.mimeType.startsWith("video/")) {
    if (!deps.transcribe) return { text: "" };
    const bucket = process.env.S3_KNOWLEDGE_BUCKET!;
    const jobName = `mp-${job.documentId}`;
    await deps.transcribe.startJob({
      bucket,
      key: job.objectKey,
      jobName,
      mediaFormat: inferMediaFormat(job.mimeType),
    });
    return { async: true, externalJobId: jobName };
  }

  return { text: "" };
}

function baseDocument(
  job: IngestionJob,
  text: string,
  status: IngestionStatus,
  language = "fr"
): DocumentRecord {
  return {
    id: job.documentId,
    title: job.title,
    ownerId: job.ownerId,
    objectKey: job.objectKey,
    mimeType: job.mimeType,
    status: status === "PROCESSING" ? "NEEDS_REVIEW" : status,
    version: job.version ?? 1,
    checksum: `worker-${Buffer.from(text).byteLength}-${job.objectKey}`,
    language,
    createdAt: new Date().toISOString(),
  };
}

function inferMediaFormat(mime: string): string | undefined {
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return undefined;
}
