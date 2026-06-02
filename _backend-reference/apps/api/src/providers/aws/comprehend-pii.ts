/**
 * Amazon Comprehend PII detector — second pass on prompts before LLM call.
 *
 * Languages: French + English (auto-detected per call). Comprehend supports
 * single-language only per request, so we run a quick heuristic to pick.
 *
 * Returns offsets for each PII entity so the caller can replace them with
 * stable tokens (<EMAIL_1>, <PHONE_2>, …) and restore them in the response.
 *
 * Cost: ~$0.0001 per 100 chars. Cap input to 5000 chars per call (Comprehend
 * limit) — `redactor.ts` chunks longer prompts.
 */
import {
  ComprehendClient,
  DetectPiiEntitiesCommand,
  type PiiEntity,
  type LanguageCode,
} from "@aws-sdk/client-comprehend";

const client = process.env.AWS_REGION ? new ComprehendClient({ region: process.env.AWS_REGION }) : null;

export interface ComprehendPiiHit {
  type: string;            // EMAIL, PHONE, SSN, NAME, ADDRESS, …
  begin: number;
  end: number;
  score: number;
}

function detectLanguage(text: string): LanguageCode {
  // Naive but cheap: count common FR stopwords vs EN.
  const fr = /\b(le|la|les|de|des|et|une?|que|qui|dans|pour|avec|sur|sont|est)\b/gi;
  const en = /\b(the|of|and|to|in|that|for|with|on|is|are|was|were)\b/gi;
  const frCount = (text.match(fr) ?? []).length;
  const enCount = (text.match(en) ?? []).length;
  return frCount >= enCount ? "fr" : "en";
}

const MAX_BYTES = 5000;

export async function detectPii(text: string): Promise<ComprehendPiiHit[]> {
  if (!client || !text) return [];
  const lang = detectLanguage(text);
  const hits: ComprehendPiiHit[] = [];

  for (let offset = 0; offset < text.length; offset += MAX_BYTES) {
    const slice = text.slice(offset, offset + MAX_BYTES);
    try {
      const res = await client.send(new DetectPiiEntitiesCommand({ Text: slice, LanguageCode: lang }));
      for (const e of (res.Entities ?? []) as PiiEntity[]) {
        if (e.Type == null || e.BeginOffset == null || e.EndOffset == null) continue;
        hits.push({
          type: e.Type,
          begin: offset + e.BeginOffset,
          end: offset + e.EndOffset,
          score: e.Score ?? 0,
        });
      }
    } catch (err) {
      console.warn("[comprehend-pii] detect failed", err);
    }
  }
  return hits;
}
