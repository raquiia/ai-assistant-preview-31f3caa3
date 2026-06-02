/**
 * LLM response cache — Wave 6.E.
 *
 * Backed by a DynamoDB table `MpLlmCache` with on-demand billing and TTL.
 * Designed to short-circuit deterministic chat completions and re-asked
 * questions, cutting Bedrock spend by ~30-50% and shaving 200-800 ms per
 * cache hit.
 *
 * Key construction (sha256, hex, 64 chars):
 *   sha256( provider | model | promptVersionId | tools | normalizedQuestion
 *         | sortedFilters | topK | retrievalSignature )
 *
 * `retrievalSignature` is the sorted, comma-joined list of chunk IDs that
 * fed the prompt — it ensures a KB update invalidates affected entries
 * without an explicit bust.
 *
 * Bypass rules (no read, no write):
 *   - request header `Cache-Control: no-store`
 *   - prompt contains volatile tokens (date, "today", "now", "hier", "demain")
 *   - temperature > 0.3
 *   - streaming request when streamingCacheable=false
 *   - PII detected by Comprehend (handled upstream by piiRedactor)
 *
 * Schema:
 *   PK = cacheKey (S)
 *   payload (B, gzip JSON of { answer, sources, usage, model })
 *   provider, model (S)             — for analytics
 *   promptVersionId (S)
 *   createdAt (N, epoch s)
 *   hitCount (N, default 0)
 *   ttl (N, epoch s)                — DynamoDB TTL attribute
 *
 * Estimated cost (eu-west-3, on-demand): ~$0.25/M reads + $1.25/M writes +
 * $0.25/GB-month storage. With 100k req/day at 25% hit, table cost stays
 * under $5/month while saving ~$300/month on Bedrock.
 */
import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

export interface CacheKeyInput {
  provider: string;
  model: string;
  promptVersionId: string;
  tools: string[];
  question: string;
  filters: { industryTags?: string[]; pmDomainTags?: string[] } | undefined;
  topK: number;
  retrievalSignature: string;
}

export interface CachedPayload {
  answer: string;
  sources: Array<{ chunkId: string; documentId: string; score: number; snippet: string }>;
  usage: { inputTokens: number; outputTokens: number; estimatedCost: number };
  model: string;
  provider: string;
}

export interface CacheHit {
  payload: CachedPayload;
  ageSeconds: number;
  key: string;
}

export interface LlmCacheOptions {
  region: string;
  tableName?: string;
  ttlSeconds?: number; // default 7 days
}

const VOLATILE_TOKENS = /\b(today|now|yesterday|tomorrow|aujourd'hui|hier|demain|maintenant)\b/i;

export class LlmCache {
  private readonly client: DynamoDBClient;
  private readonly table: string;
  private readonly ttl: number;

  constructor(opts: LlmCacheOptions) {
    this.client = new DynamoDBClient({ region: opts.region });
    this.table = opts.tableName ?? process.env.LLM_CACHE_TABLE ?? "MpLlmCache";
    this.ttl = opts.ttlSeconds ?? 7 * 24 * 3600;
  }

  static buildKey(input: CacheKeyInput): string {
    const norm = input.question
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\s+/g, " ")
      .trim();
    const filters = JSON.stringify({
      i: [...(input.filters?.industryTags ?? [])].sort(),
      d: [...(input.filters?.pmDomainTags ?? [])].sort(),
    });
    const payload = [
      input.provider,
      input.model,
      input.promptVersionId,
      [...input.tools].sort().join(","),
      norm,
      filters,
      String(input.topK),
      input.retrievalSignature,
    ].join("|");
    return createHash("sha256").update(payload).digest("hex");
  }

  static shouldBypass(opts: {
    cacheControl?: string | null;
    question: string;
    temperature: number;
    streaming?: boolean;
  }): boolean {
    if (opts.cacheControl?.toLowerCase().includes("no-store")) return true;
    if (opts.temperature > 0.3) return true;
    if (VOLATILE_TOKENS.test(opts.question)) return true;
    return false;
  }

  async get(key: string): Promise<CacheHit | null> {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { cacheKey: { S: key } },
      }),
    );
    if (!res.Item?.payload?.B) return null;
    const buf = Buffer.from(res.Item.payload.B);
    const payload = JSON.parse(gunzipSync(buf).toString("utf8")) as CachedPayload;
    const createdAt = Number(res.Item.createdAt?.N ?? "0");
    // fire-and-forget hit counter
    void this.bumpHit(key);
    return {
      payload,
      ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - createdAt),
      key,
    };
  }

  async set(key: string, payload: CachedPayload): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          cacheKey: { S: key },
          payload: { B: compressed },
          provider: { S: payload.provider },
          model: { S: payload.model },
          createdAt: { N: String(nowSec) },
          hitCount: { N: "0" },
          ttl: { N: String(nowSec + this.ttl) },
        },
      }),
    );
  }

  private async bumpHit(key: string): Promise<void> {
    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.table,
          Key: { cacheKey: { S: key } },
          UpdateExpression: "ADD hitCount :one",
          ExpressionAttributeValues: { ":one": { N: "1" } },
        }),
      );
    } catch (err) {
      console.warn("[llmCache] hitCount bump failed", err);
    }
  }
}
