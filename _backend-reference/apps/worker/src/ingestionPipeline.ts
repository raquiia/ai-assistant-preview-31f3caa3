import { chunkDocument } from "@mp/rag";
import { detectLanguage, isAllowedUploadMimeType, type DocumentChunk, type DocumentRecord } from "@mp/shared";

export interface IngestionJob {
  documentId: string;
  title: string;
  ownerId: string;
  objectKey: string;
  mimeType: string;
  rawText?: string;
  version?: number;
}

export interface IngestionResult {
  document: DocumentRecord;
  chunks: DocumentChunk[];
  status: "PUBLISHED" | "NEEDS_REVIEW";
  warnings: string[];
}

export async function runIngestion(job: IngestionJob): Promise<IngestionResult> {
  if (!isAllowedUploadMimeType(job.mimeType)) throw new Error(`Unsupported mime type: ${job.mimeType}`);
  const warnings: string[] = [];
  const extractedText = await extractText(job);
  if (!extractedText.trim()) {
    warnings.push("empty_extraction_requires_manual_review");
  }
  const language = detectLanguage(extractedText || job.title, "fr");
  const status = warnings.length || !job.mimeType.startsWith("text/") ? "NEEDS_REVIEW" : "PUBLISHED";
  const document: DocumentRecord = {
    id: job.documentId,
    title: job.title,
    ownerId: job.ownerId,
    objectKey: job.objectKey,
    mimeType: job.mimeType,
    status,
    version: job.version ?? 1,
    checksum: `worker-${Buffer.from(extractedText).byteLength}-${job.objectKey}`,
    language,
    createdAt: new Date().toISOString()
  };
  const chunks = chunkDocument({
    documentId: document.id,
    title: document.title,
    version: document.version,
    text: extractedText || `Document ${document.title} en attente d'extraction OCR/transcription avant publication.`,
    language
  });
  return { document, chunks, status, warnings };
}

async function extractText(job: IngestionJob): Promise<string> {
  if (job.rawText) return job.rawText;
  if (job.mimeType.startsWith("text/")) return "";
  if (job.mimeType === "application/pdf") return "";
  if (job.mimeType.startsWith("image/")) return "";
  if (job.mimeType.startsWith("audio/") || job.mimeType.startsWith("video/")) return "";
  return "";
}
