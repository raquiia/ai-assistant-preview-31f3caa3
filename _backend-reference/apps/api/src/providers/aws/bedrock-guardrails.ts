/**
 * Bedrock Guardrails wrapper — applies a managed guardrail to every
 * InvokeModel / ConverseStream call so the provider itself blocks denied
 * topics, profanity, PII, and prompt injection patterns we configured.
 *
 * Complementary to piiRedactor (which strips PII *before* the call); this is
 * the safety net on the *model output* side too.
 *
 * Guardrail is created in Terraform (`infra/aws/bedrock-guardrails.tf`); only
 * the ID + version are read at runtime via env vars.
 */

export interface GuardrailConfig {
  guardrailIdentifier: string;
  guardrailVersion: string; // "DRAFT" or a numeric version
  trace?: "ENABLED" | "DISABLED";
}

let cached: GuardrailConfig | null | undefined;

export function getGuardrail(): GuardrailConfig | null {
  if (cached !== undefined) return cached;
  const id = process.env.BEDROCK_GUARDRAIL_ID;
  const ver = process.env.BEDROCK_GUARDRAIL_VERSION ?? "DRAFT";
  cached = id ? { guardrailIdentifier: id, guardrailVersion: ver, trace: "ENABLED" } : null;
  return cached;
}

/**
 * Merge guardrail config into a Bedrock InvokeModel / Converse request body.
 * No-op when no guardrail is configured (local dev / non-AWS deploys).
 */
export function withGuardrail<T extends Record<string, unknown>>(input: T): T {
  const g = getGuardrail();
  if (!g) return input;
  return { ...input, ...g };
}

export class GuardrailIntervenedError extends Error {
  constructor(public readonly reason: string, public readonly action: "BLOCKED" | "MASKED") {
    super(`Bedrock guardrail intervened: ${reason}`);
  }
}

/**
 * Inspect a Bedrock Converse response for guardrail intervention.
 * Throws GuardrailIntervenedError if the model output was blocked.
 */
export function assertNotBlocked(response: { stopReason?: string; trace?: { guardrail?: unknown } }): void {
  if (response.stopReason === "guardrail_intervened") {
    throw new GuardrailIntervenedError("output_blocked", "BLOCKED");
  }
}
