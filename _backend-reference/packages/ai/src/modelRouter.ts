import { estimateTokens, humanEscalationMessage, type AiResponse, type AiUsage, type PromptVersion, type SourceCitation, type User } from "@mp/shared";
import { buildPrompt } from "./promptBuilder.js";
import { evaluateQuality } from "./qualityGate.js";
import type { AiProvider } from "./providers.js";

export interface RouteAnswerInput {
  user: User;
  question: string;
  language: string;
  prompt: PromptVersion;
  sources: SourceCitation[];
  adminGuidance: string[];
  primaryProvider: AiProvider;
  fallbackProvider: AiProvider;
  settings: {
    mistralModel: string;
    openAiModel: string;
    temperature: number;
    maxTokens: number;
    qualityThreshold: number;
  };
  forceFallback?: boolean;
}

export interface RoutedAnswer {
  response: AiResponse;
  usage: AiUsage;
  content: string;
  qualityReasons: string[];
}

export class ModelRouter {
  async answer(input: RouteAnswerInput): Promise<RoutedAnswer> {
    const prompt = buildPrompt(input);
    const started = Date.now();
    const request = {
      prompt,
      question: input.question,
      language: input.language,
      model: input.forceFallback ? input.settings.openAiModel : input.settings.mistralModel,
      temperature: input.settings.temperature,
      maxTokens: input.settings.maxTokens,
      sources: input.sources
    };

    let fallbackUsed = Boolean(input.forceFallback);
    let completion = await (input.forceFallback ? input.fallbackProvider : input.primaryProvider).complete(request);
    let quality = evaluateQuality(completion.content, input.sources, input.sources.length > 0, input.settings.qualityThreshold);

    if (!quality.passed && !input.forceFallback) {
      fallbackUsed = true;
      completion = await input.fallbackProvider.complete({ ...request, model: input.settings.openAiModel });
      quality = evaluateQuality(completion.content, input.sources, input.sources.length > 0, Math.max(45, input.settings.qualityThreshold - 10));
    }

    const escalationTriggered = input.sources.length === 0 || quality.confidence < 45;
    const content = escalationTriggered ? humanEscalationMessage(input.language) : completion.content;
    const response: AiResponse = {
      id: `resp-${crypto.randomUUID()}`,
      messageId: "",
      provider: fallbackUsed ? input.fallbackProvider.provider : completion.provider,
      model: fallbackUsed ? input.settings.openAiModel : completion.model,
      promptVersionId: input.prompt.id,
      content,
      confidence: escalationTriggered ? Math.min(quality.confidence, 40) : quality.confidence,
      latencyMs: Date.now() - started,
      fallbackUsed,
      escalationTriggered,
      createdAt: new Date().toISOString(),
      comparisonId: input.forceFallback ? `cmp-${crypto.randomUUID()}` : null
    };
    const usage: AiUsage = {
      id: `usage-${crypto.randomUUID()}`,
      responseId: response.id,
      inputTokens: completion.inputTokens || estimateTokens(prompt),
      outputTokens: completion.outputTokens || estimateTokens(content),
      reasoningTokens: completion.reasoningTokens,
      cachedTokens: completion.cachedTokens,
      estimatedCost: completion.estimatedCost,
      currency: "EUR"
    };
    return { response, usage, content, qualityReasons: quality.reasons };
  }
}
