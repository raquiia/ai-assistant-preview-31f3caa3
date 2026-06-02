/**
 * Per-role model access policy.
 *
 * Hard-codes who can call which provider/model. Used by chatService BEFORE
 * invoking the LLM — distinct from BudgetService ($) and RateLimitService
 * (tokens/min).
 *
 * Override via env:
 *   MODEL_POLICY_JSON='{"CONSULTANT":["bedrock:anthropic.claude-3-haiku-*","mistral:mistral-small-latest"]}'
 *
 * Patterns support a trailing `*` wildcard.
 */
export type Role = "SUPER_ADMIN" | "MANAGER" | "AUDITOR" | "CONSULTANT";

const DEFAULTS: Record<Role, string[]> = {
  SUPER_ADMIN: ["*"],
  MANAGER: ["bedrock:*", "mistral:*", "openai:*"],
  AUDITOR: [
    "bedrock:anthropic.claude-3-5-sonnet-*",
    "bedrock:anthropic.claude-3-haiku-*",
    "mistral:mistral-large-*",
  ],
  CONSULTANT: [
    "bedrock:anthropic.claude-3-haiku-*",
    "mistral:mistral-small-*",
    "openai:gpt-4o-mini",
  ],
};

let cached: Record<Role, string[]> | null = null;
function load(): Record<Role, string[]> {
  if (cached) return cached;
  const overrides = process.env.MODEL_POLICY_JSON;
  if (!overrides) return (cached = DEFAULTS);
  try {
    const parsed = JSON.parse(overrides) as Partial<Record<Role, string[]>>;
    cached = { ...DEFAULTS, ...parsed } as Record<Role, string[]>;
  } catch (err) {
    console.warn("[modelPolicy] MODEL_POLICY_JSON parse failed", err);
    cached = DEFAULTS;
  }
  return cached;
}

function matches(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return pattern === value;
}

export class ModelNotAllowedError extends Error {
  constructor(public readonly role: Role, public readonly providerModel: string) {
    super(`Role ${role} is not allowed to invoke ${providerModel}`);
  }
}

export function isAllowed(role: Role, providerModel: string): boolean {
  const list = load()[role] ?? [];
  return list.some((p) => matches(p, providerModel));
}

export function assertAllowed(role: Role, providerModel: string): void {
  if (!isAllowed(role, providerModel)) throw new ModelNotAllowedError(role, providerModel);
}

export function allowedModels(role: Role): string[] {
  return load()[role] ?? [];
}

export function resetModelPolicyCache(): void {
  cached = null;
}
