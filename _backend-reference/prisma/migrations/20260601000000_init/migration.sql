-- Initial PostgreSQL migration generated for the MIGSO-PCUBED AI Assistant schema.
-- Prisma can regenerate a fully expanded migration with:
-- npm run db:migrate

CREATE TYPE "Role" AS ENUM ('CONSULTANT', 'MANAGER', 'SUPER_ADMIN', 'AUDITOR');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'PENDING_MANAGER');
CREATE TYPE "ConversationChannel" AS ENUM ('WEB', 'EMBED', 'API');
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'NEEDS_REVIEW', 'PUBLISHED', 'ARCHIVED', 'ERROR');
CREATE TYPE "CorrectionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'REJECTED');
CREATE TYPE "FeedbackRating" AS ENUM ('UP', 'DOWN', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "managerId" TEXT,
  "language" TEXT NOT NULL DEFAULT 'fr',
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ManagerProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "department" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "managerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "channel" "ConversationChannel" NOT NULL DEFAULT 'WEB',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Attachment" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "extractedTextRef" TEXT
);

CREATE TABLE "Document" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "checksum" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("objectKey", "version")
);

CREATE TABLE "DocumentChunk" (
  "id" TEXT PRIMARY KEY,
  "documentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "page" INTEGER,
  "section" TEXT,
  "paragraph" INTEGER,
  "charStart" INTEGER,
  "charEnd" INTEGER,
  "timeStart" DOUBLE PRECISION,
  "timeEnd" DOUBLE PRECISION,
  "industryTags" TEXT[],
  "pmDomainTags" TEXT[],
  "vectorId" TEXT NOT NULL UNIQUE,
  "sourceUri" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PromptVersion" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "configJson" JSONB NOT NULL,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "active" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AiResponse" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersionId" TEXT NOT NULL REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "content" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT FALSE,
  "escalationTriggered" BOOLEAN NOT NULL DEFAULT FALSE,
  "comparisonId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AiUsage" (
  "id" TEXT PRIMARY KEY,
  "responseId" TEXT NOT NULL UNIQUE REFERENCES "AiResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR'
);

CREATE TABLE "Feedback" (
  "id" TEXT PRIMARY KEY,
  "responseId" TEXT NOT NULL REFERENCES "AiResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "rating" "FeedbackRating" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AdminComment" (
  "id" TEXT PRIMARY KEY,
  "responseId" TEXT NOT NULL REFERENCES "AiResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "adminId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "comment" TEXT NOT NULL,
  "status" "CorrectionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "KnowledgeCorrection" (
  "id" TEXT PRIMARY KEY,
  "adminCommentId" TEXT NOT NULL UNIQUE REFERENCES "AdminComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tags" TEXT[],
  "status" "CorrectionStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "activatedAt" TIMESTAMP(3)
);

CREATE TABLE "RetrievalEvent" (
  "id" TEXT PRIMARY KEY,
  "responseId" TEXT NOT NULL REFERENCES "AiResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "chunkId" TEXT NOT NULL REFERENCES "DocumentChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "score" INTEGER NOT NULL,
  "rank" INTEGER NOT NULL,
  "usedInAnswer" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "AiProviderConfig" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "encryptedApiKeyRef" TEXT,
  "model" TEXT NOT NULL,
  "configJson" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadataJson" JSONB NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SystemMetricDaily" (
  "id" TEXT PRIMARY KEY,
  "date" TIMESTAMP(3) NOT NULL,
  "metricName" TEXT NOT NULL,
  "value" DECIMAL(65,30) NOT NULL,
  "dimensionsJson" JSONB NOT NULL
);

ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_role_status_idx" ON "User"("role", "status");
CREATE INDEX "User_managerId_idx" ON "User"("managerId");
CREATE INDEX "Conversation_userId_createdAt_idx" ON "Conversation"("userId", "createdAt");
CREATE INDEX "Conversation_managerId_createdAt_idx" ON "Conversation"("managerId", "createdAt");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Document_status_idx" ON "Document"("status");
CREATE INDEX "DocumentChunk_documentId_version_idx" ON "DocumentChunk"("documentId", "version");
CREATE INDEX "DocumentChunk_industryTags_idx" ON "DocumentChunk" USING GIN ("industryTags");
CREATE INDEX "DocumentChunk_pmDomainTags_idx" ON "DocumentChunk" USING GIN ("pmDomainTags");
CREATE INDEX "AiResponse_provider_model_idx" ON "AiResponse"("provider", "model");
CREATE INDEX "AiResponse_fallbackUsed_escalationTriggered_idx" ON "AiResponse"("fallbackUsed", "escalationTriggered");
CREATE INDEX "RetrievalEvent_responseId_idx" ON "RetrievalEvent"("responseId");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
