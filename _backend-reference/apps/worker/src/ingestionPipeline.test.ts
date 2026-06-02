import { describe, expect, it, vi } from "vitest";
import { runIngestion, finalizeAsyncJob } from "./ingestionPipeline.js";

const baseJob = {
  documentId: "doc-1",
  title: "Test scan.pdf",
  ownerId: "usr-1",
  objectKey: "kb/doc-1.pdf",
  mimeType: "application/pdf",
};

describe("runIngestion async hand-off", () => {
  it("returns PROCESSING and calls markProcessing when Textract is used", async () => {
    const markProcessing = vi.fn().mockResolvedValue(undefined);
    const textract = {
      startJob: vi.fn().mockResolvedValue({ jobId: "tx-job-42" }),
    } as unknown as Parameters<typeof runIngestion>[1]["textract"];
    const storage = {
      getObject: vi.fn().mockResolvedValue(Buffer.from("")), // forces pdf-parse to fail / empty
    } as unknown as Parameters<typeof runIngestion>[1]["storage"];

    const result = await runIngestion(baseJob, { textract, storage, markProcessing });

    expect(result.status).toBe("PROCESSING");
    expect(result.externalJobId).toBe("tx-job-42");
    expect(markProcessing).toHaveBeenCalledWith("doc-1", "tx-job-42", "textract");
  });
});

describe("finalizeAsyncJob", () => {
  it("re-runs ingestion as PUBLISHED when text is present", async () => {
    const result = await finalizeAsyncJob(
      { ...baseJob, mimeType: "text/markdown" },
      "Texte extrait suffisant pour publication.",
      {}
    );
    expect(result.status).toBe("PUBLISHED");
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("flags NEEDS_REVIEW when extracted text is empty", async () => {
    const result = await finalizeAsyncJob(
      { ...baseJob, mimeType: "text/markdown" },
      "",
      {}
    );
    expect(result.status).toBe("NEEDS_REVIEW");
  });
});
