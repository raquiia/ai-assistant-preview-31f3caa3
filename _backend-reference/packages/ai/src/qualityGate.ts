import type { SourceCitation } from "@mp/shared";

export interface QualityGateResult {
  passed: boolean;
  confidence: number;
  reasons: string[];
}

export function evaluateQuality(content: string, sources: SourceCitation[], sourceRequired: boolean, minConfidence: number): QualityGateResult {
  const reasons: string[] = [];
  let confidence = sources.length ? Math.min(95, Math.round(sources.reduce((sum, source) => sum + source.score, 0) / sources.length)) : 35;

  if (!content.trim()) {
    reasons.push("empty_answer");
    confidence = 0;
  }
  if (sourceRequired && sources.length === 0) {
    reasons.push("missing_sources");
    confidence = Math.min(confidence, 35);
  }
  if (/ignore previous|system prompt|developer message/i.test(content)) {
    reasons.push("prompt_injection_leak");
    confidence = Math.min(confidence, 20);
  }
  if (content.length < 80 && sources.length > 0) {
    reasons.push("too_short");
    confidence = Math.min(confidence, 60);
  }

  return {
    passed: confidence >= minConfidence && reasons.length === 0,
    confidence,
    reasons
  };
}
