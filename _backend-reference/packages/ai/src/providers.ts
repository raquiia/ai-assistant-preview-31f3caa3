import type { SourceCitation } from "@mp/shared";

export interface CompletionRequest {
  prompt: string;
  question: string;
  language: string;
  model: string;
  temperature: number;
  maxTokens: number;
  sources: SourceCitation[];
}

export interface CompletionResult {
  provider: "mistral" | "openai" | "local";
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  estimatedCost: number;
}

export interface AiProvider {
  readonly provider: "mistral" | "openai" | "local";
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export class LocalGroundedProvider implements AiProvider {
  readonly provider = "local" as const;

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const sourceList = request.sources
      .map((source, index) => `${index + 1}. ${source.title}${source.page ? `, page ${source.page}` : ""} - pertinence estimee ${source.score}/100`)
      .join("\n");
    const firstSource = request.sources[0];
    const intro = request.language.startsWith("en")
      ? "Summary"
      : request.language.startsWith("es")
        ? "Resumen"
        : "Resume";
    const steps = request.language.startsWith("en")
      ? "Recommended steps"
      : request.language.startsWith("es")
        ? "Pasos recomendados"
        : "Etapes recommandees";
    const content = firstSource
      ? `${intro}: d'apres la base MIGSO-PCUBED, la reponse doit rester liee aux elements sources et aux pratiques PMO validees.\n\n${steps}:\n1. Clarifier le contexte et les hypotheses.\n2. Documenter l'impact planning/cout/risque.\n3. Assigner un responsable, une action de mitigation et une date de revue.\n4. Escalader au manager si la confiance ou le perimetre reste insuffisant.\n\nSources:\n${sourceList}`
      : request.language.startsWith("en")
        ? "I do not have reliable internal sources for this question. We cannot answer this request reliably. Please contact your manager."
        : "Je ne dispose pas de sources internes fiables pour cette question. Nous ne pouvons pas repondre de maniere fiable a cette demande. Contactez votre manager.";

    return {
      provider: this.provider,
      model: "local-grounded",
      content,
      inputTokens: Math.ceil(request.prompt.length / 4),
      outputTokens: Math.ceil(content.length / 4),
      reasoningTokens: 0,
      cachedTokens: 0,
      estimatedCost: 0
    };
  }
}

export class MistralProvider implements AiProvider {
  readonly provider = "mistral" as const;

  constructor(private readonly apiKey?: string) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) {
      return new LocalGroundedProvider().complete({ ...request, model: "local-grounded" });
    }

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        messages: [{ role: "user", content: request.prompt }]
      })
    });

    if (!response.ok) throw new Error(`Mistral request failed: ${response.status}`);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const content = json.choices?.[0]?.message?.content ?? "";
    return {
      provider: this.provider,
      model: request.model,
      content,
      inputTokens: json.usage?.prompt_tokens ?? Math.ceil(request.prompt.length / 4),
      outputTokens: json.usage?.completion_tokens ?? Math.ceil(content.length / 4),
      reasoningTokens: 0,
      cachedTokens: 0,
      estimatedCost: 0
    };
  }
}

export class OpenAIProvider implements AiProvider {
  readonly provider = "openai" as const;

  constructor(private readonly apiKey?: string) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) {
      return new LocalGroundedProvider().complete({ ...request, model: "local-grounded" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        input: request.prompt,
        temperature: request.temperature,
        max_output_tokens: request.maxTokens
      })
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const json = (await response.json()) as {
      output_text?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        output_tokens_details?: { reasoning_tokens?: number };
        input_tokens_details?: { cached_tokens?: number };
      };
    };
    const content = json.output_text ?? "";
    return {
      provider: this.provider,
      model: request.model,
      content,
      inputTokens: json.usage?.input_tokens ?? Math.ceil(request.prompt.length / 4),
      outputTokens: json.usage?.output_tokens ?? Math.ceil(content.length / 4),
      reasoningTokens: json.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      cachedTokens: json.usage?.input_tokens_details?.cached_tokens ?? 0,
      estimatedCost: 0
    };
  }
}
