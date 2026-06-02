-- Wave 7 — Textract async extraction
-- Adds the columns needed to track async OCR jobs on Document.

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "externalJobId"        TEXT,
  ADD COLUMN IF NOT EXISTS "extractionEngine"     TEXT,
  ADD COLUMN IF NOT EXISTS "extractionConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "extractionWarnings"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS "Document_externalJobId_key"
  ON "Document" ("externalJobId");

CREATE INDEX IF NOT EXISTS "Document_externalJobId_idx"
  ON "Document" ("externalJobId");
