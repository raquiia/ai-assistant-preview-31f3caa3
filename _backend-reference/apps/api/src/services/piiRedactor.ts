/**
 * PII redaction service — two-pass detection, token substitution, restoration.
 *
 * Flow:
 *   1. redact(text) → { redacted, tokenMap } using regex (cheap, deterministic)
 *      then Comprehend (catches names/addresses regex misses).
 *   2. Caller sends `redacted` to Bedrock / OpenAI / Mistral.
 *   3. restore(response, tokenMap) → puts original values back in.
 *
 * Audit: emits `pii.redacted` events with the COUNT per type (never the value).
 * Toggleable per Org via `Org.piiRedactionEnabled`.
 *
 * Bedrock Guardrails complement (not replace) this — see bedrock-guardrails.ts.
 */
import { detectPii, type ComprehendPiiHit } from "../providers/aws/comprehend-pii";

export interface RedactResult {
  redacted: string;
  tokenMap: Map<string, string>;       // token → original
  counts: Record<string, number>;      // type → count
}

interface Range {
  begin: number;
  end: number;
  type: string;
  value: string;
}

// ── Regex pass (cheap, runs first) ──────────────────────────────────────────
const REGEX_RULES: Array<{ type: string; re: RegExp }> = [
  { type: "EMAIL",       re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: "PHONE_FR",    re: /\b(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/g },
  { type: "PHONE_INTL",  re: /\b\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g },
  { type: "IBAN",        re: /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){3,7}\d{0,4}\b/g },
  { type: "NIR",         re: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g },
  { type: "CREDIT_CARD", re: /\b(?:\d[ -]?){13,19}\b/g },
  { type: "IPV4",        re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: "URL_TOKEN",   re: /\b(?:[A-Za-z0-9_-]{24,}\.){2}[A-Za-z0-9_-]{8,}\b/g }, // JWT-ish
];

function regexRanges(text: string): Range[] {
  const out: Range[] = [];
  for (const { type, re } of REGEX_RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({ type, begin: m.index, end: m.index + m[0].length, value: m[0] });
    }
  }
  return out;
}

function comprehendRanges(hits: ComprehendPiiHit[], text: string): Range[] {
  return hits
    .filter((h) => h.score >= 0.85)
    .map((h) => ({ type: h.type, begin: h.begin, end: h.end, value: text.slice(h.begin, h.end) }));
}

/** Merge overlapping ranges, keeping the longest type label. */
function mergeRanges(ranges: Range[]): Range[] {
  ranges.sort((a, b) => a.begin - b.begin || b.end - b.begin - (a.end - a.begin));
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.begin < last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

export async function redact(text: string, opts: { useComprehend?: boolean } = {}): Promise<RedactResult> {
  if (!text) return { redacted: text, tokenMap: new Map(), counts: {} };

  const ranges = regexRanges(text);
  if (opts.useComprehend !== false) {
    const hits = await detectPii(text);
    ranges.push(...comprehendRanges(hits, text));
  }
  const merged = mergeRanges(ranges);

  const tokenMap = new Map<string, string>();
  const counts: Record<string, number> = {};
  let cursor = 0;
  const parts: string[] = [];

  for (const r of merged) {
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    const token = `<${r.type}_${counts[r.type]}>`;
    tokenMap.set(token, r.value);
    parts.push(text.slice(cursor, r.begin), token);
    cursor = r.end;
  }
  parts.push(text.slice(cursor));

  return { redacted: parts.join(""), tokenMap, counts };
}

/** Replace tokens with their original values. */
export function restore(text: string, tokenMap: Map<string, string>): string {
  if (!tokenMap.size || !text) return text;
  let out = text;
  for (const [token, original] of tokenMap) {
    out = out.split(token).join(original);
  }
  return out;
}
