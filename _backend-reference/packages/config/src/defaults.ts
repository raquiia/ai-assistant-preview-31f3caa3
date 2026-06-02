import type { AppSettings } from "@mp/shared";

export const defaultSettings: AppSettings = {
  topK: 5,
  minRelevanceScore: 55,
  qualityThreshold: 70,
  temperature: 0.2,
  maxTokens: 1200,
  reasoningEffort: "medium",
  verbosity: "balanced",
  allowedEmbedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  mistralModel: "mistral-large-latest",
  openAiModel: "gpt-5.5",
  searchProvider: "none"
};
