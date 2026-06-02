/**
 * Pricing table (USD per 1K tokens or per unit) used by usageTrackingService
 * to translate raw provider usage into a $ cost.
 *
 * Source of truth (updated 2025-Q4). Override per-deployment via env:
 *   PRICING_OVERRIDES_JSON='{"bedrock:anthropic.claude-3-5-sonnet":{"input":0.003,"output":0.015}}'
 *
 * Keys are `<provider>:<model>`. Use `input` / `output` for token-based models;
 * use `unit` for per-call services (Textract page, Transcribe minute).
 */

export interface ModelPricing {
  input?: number; // USD per 1K input tokens
  output?: number; // USD per 1K output tokens
  unit?: number; // USD per unit (page, minute, request)
  unitName?: "page" | "minute" | "request" | "1k_tokens";
}

export type PricingTable = Record<string, ModelPricing>;

const DEFAULT_PRICING: PricingTable = {
  // ---- Bedrock embeddings ----
  "bedrock:amazon.titan-embed-text-v2:0": { input: 0.00002, unitName: "1k_tokens" },
  "bedrock:cohere.embed-multilingual-v3": { input: 0.0001, unitName: "1k_tokens" },

  // ---- Bedrock chat models (commonly used) ----
  "bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0": { input: 0.003, output: 0.015 },
  "bedrock:anthropic.claude-3-haiku-20240307-v1:0": { input: 0.00025, output: 0.00125 },
  "bedrock:mistral.mistral-large-2407-v1:0": { input: 0.003, output: 0.009 },

  // ---- Direct providers ----
  "mistral:mistral-large-latest": { input: 0.002, output: 0.006 },
  "mistral:mistral-small-latest": { input: 0.0002, output: 0.0006 },
  "openai:gpt-4o": { input: 0.0025, output: 0.01 },
  "openai:gpt-4o-mini": { input: 0.00015, output: 0.0006 },

  // ---- Per-unit AWS services ----
  "textract:detect": { unit: 0.0015, unitName: "page" }, // DetectDocumentText
  "textract:analyze": { unit: 0.05, unitName: "page" }, // AnalyzeDocument (forms+tables)
  "transcribe:standard": { unit: 0.024, unitName: "minute" },

  // ---- Search APIs ----
  "tavily:search": { unit: 0.008, unitName: "request" },
  "serpapi:search": { unit: 0.015, unitName: "request" },
};

let cachedTable: PricingTable | null = null;

function loadTable(): PricingTable {
  if (cachedTable) return cachedTable;
  const overrides = process.env.PRICING_OVERRIDES_JSON;
  if (!overrides) {
    cachedTable = DEFAULT_PRICING;
    return cachedTable;
  }
  try {
    const parsed = JSON.parse(overrides) as PricingTable;
    cachedTable = { ...DEFAULT_PRICING, ...parsed };
  } catch (err) {
    console.warn("[pricing] PRICING_OVERRIDES_JSON parse failed, using defaults", err);
    cachedTable = DEFAULT_PRICING;
  }
  return cachedTable;
}

export interface CostInput {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  units?: number; // pages / minutes / requests
}

export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  unitUsd: number;
  totalUsd: number;
  matched: boolean;
}

export function computeCost(input: CostInput): CostBreakdown {
  const table = loadTable();
  const key = `${input.provider}:${input.model}`;
  const p = table[key];
  if (!p) {
    return { inputUsd: 0, outputUsd: 0, unitUsd: 0, totalUsd: 0, matched: false };
  }
  const inputUsd = ((input.inputTokens ?? 0) / 1000) * (p.input ?? 0);
  const outputUsd = ((input.outputTokens ?? 0) / 1000) * (p.output ?? 0);
  const unitUsd = (input.units ?? 0) * (p.unit ?? 0);
  const totalUsd = inputUsd + outputUsd + unitUsd;
  return { inputUsd, outputUsd, unitUsd, totalUsd, matched: true };
}

export function resetPricingCache(): void {
  cachedTable = null;
}
