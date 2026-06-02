import type { AppSettings } from "@mp/shared";

export const defaultSettings: AppSettings = {
  // RAG
  topK: 5,
  minRelevanceScore: 55,
  qualityThreshold: 70,
  rerankerEnabled: true,
  rerankerModel: "cohere-rerank-3",
  embeddingModel: "text-embedding-3-large",
  contextWindowTokens: 8000,
  maxHistoryTurns: 6,
  webFallbackEnabled: false,
  // Inference
  temperature: 0.2,
  topP: 0.9,
  maxTokens: 1200,
  presencePenalty: 0,
  frequencyPenalty: 0,
  seed: null,
  stopSequences: [],
  streaming: true,
  responseFormat: "text",
  timeoutMs: 30000,
  reasoningEffort: "medium",
  verbosity: "balanced",
  // Models
  defaultModel: "mistral-large-latest",
  fallbackModel: "gpt-5.5",
  fallbackTriggers: ["timeout", "rate_limit", "server_error"],
  mistralModel: "mistral-large-latest",
  openAiModel: "gpt-5.5",
  searchProvider: "none",
  // Guardrails
  forbiddenTopics: [],
  piiRedaction: true,
  piiRedactionLevel: "standard",
  safetyThreshold: "medium",
  refusalTemplate:
    "Je ne peux pas répondre à cette demande. Merci de reformuler ou de contacter votre manager.",
  logUserMessagesPlaintext: false,
  // Budgets & quotas
  dailyTokenBudget: 2_000_000,
  monthlyCostCapEur: 1500,
  requestsPerMinutePerUser: 20,
  budgetAlertThreshold: 80,
  allowedModelsByRole: {
    CONSULTANT: ["mistral-large-latest", "gpt-5.5"],
    MANAGER: ["mistral-large-latest", "gpt-5.5"],
    SUPER_ADMIN: ["mistral-large-latest", "gpt-5.5"],
    AUDITOR: ["mistral-large-latest"]
  },
  // Embed
  allowedEmbedOrigins: ["http://localhost:5173", "http://localhost:3000"]
};
