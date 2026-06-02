// Types portés depuis packages/shared du repo mp-ai-assistant.
// Gardés alignés sur le backend Fastify pour faciliter l'intégration AWS.

export type Role = "CONSULTANT" | "MANAGER" | "SUPER_ADMIN" | "AUDITOR";
export type UserStatus = "ACTIVE" | "DISABLED" | "PENDING_MANAGER";
export type ConversationChannel = "WEB" | "EMBED" | "API";
export type MessageRole = "user" | "assistant" | "system";
export type DocumentStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "NEEDS_REVIEW"
  | "PUBLISHED"
  | "ARCHIVED"
  | "ERROR";
export type CorrectionStatus = "DRAFT" | "APPROVED" | "ACTIVE" | "REJECTED";
export type FeedbackRating = "UP" | "DOWN" | "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  managerId?: string | null;
  language: string;
  status: UserStatus;
  department?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagerProfile {
  id: string;
  userId: string;
  department: string;
  active: boolean;
}

export interface Conversation {
  id: string;
  userId: string;
  managerId?: string | null;
  title: string;
  language: string;
  channel: ConversationChannel;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  language: string;
  createdAt: string;
}

export interface AiResponse {
  id: string;
  messageId: string;
  provider: "mistral" | "openai" | "local";
  model: string;
  promptVersionId: string;
  content: string;
  confidence: number;
  latencyMs: number;
  fallbackUsed: boolean;
  escalationTriggered: boolean;
  createdAt: string;
  comparisonId?: string | null;
}

export interface AiUsage {
  id: string;
  responseId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  estimatedCost: number;
  currency: string;
}

export interface Feedback {
  id: string;
  responseId: string;
  userId: string;
  rating: FeedbackRating;
  comment?: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  ownerId: string;
  objectKey: string;
  mimeType: string;
  status: DocumentStatus;
  version: number;
  checksum: string;
  language: string;
  createdAt: string;
}

export interface SourceCitation {
  chunkId: string;
  documentId: string;
  title: string;
  page?: number | null;
  section?: string | null;
  paragraph?: number | null;
  timeStart?: number | null;
  timeEnd?: number | null;
  excerpt: string;
  score: number;
  sourceUri: string;
}

export interface PromptVersion {
  id: string;
  name: string;
  content: string;
  configJson: Record<string, unknown>;
  createdById: string;
  active: boolean;
  createdAt: string;
}

export interface AiProviderConfig {
  id: string;
  provider: "mistral" | "openai" | "search";
  encryptedApiKeyRef?: string | null;
  model: string;
  configJson: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  maskedKey?: string | null;
}

export interface AuditEvent {
  id: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadataJson: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface AppSettings {
  // RAG
  topK: number;
  minRelevanceScore: number;
  qualityThreshold: number;
  rerankerEnabled: boolean;
  rerankerModel: string;
  embeddingModel: string;
  contextWindowTokens: number;
  maxHistoryTurns: number;
  webFallbackEnabled: boolean;
  // Inférence
  temperature: number;
  topP: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
  seed: number | null;
  stopSequences: string[];
  streaming: boolean;
  responseFormat: "text" | "json" | "structured";
  timeoutMs: number;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
  verbosity: "concise" | "balanced" | "detailed";
  // Modèles
  defaultModel: string;
  fallbackModel: string;
  fallbackTriggers: Array<"timeout" | "rate_limit" | "credit_exhausted" | "server_error">;
  mistralModel: string;
  openAiModel: string;
  searchProvider: "mock" | "openai_hosted" | "tavily" | "serpapi" | "none";
  // Garde-fous
  forbiddenTopics: string[];
  piiRedaction: boolean;
  piiRedactionLevel: "standard" | "strict";
  safetyThreshold: "low" | "medium" | "high";
  refusalTemplate: string;
  logUserMessagesPlaintext: boolean;
  // Budget & quotas
  dailyTokenBudget: number;
  monthlyCostCapEur: number;
  requestsPerMinutePerUser: number;
  budgetAlertThreshold: number;
  allowedModelsByRole: Record<"CONSULTANT" | "MANAGER" | "SUPER_ADMIN" | "AUDITOR", string[]>;
  // Embed
  allowedEmbedOrigins: string[];
}

