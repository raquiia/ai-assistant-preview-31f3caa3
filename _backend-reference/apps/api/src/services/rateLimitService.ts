/**
 * Token-bucket rate limiter — caps short-burst token consumption per
 * (user, model) to prevent a single chat from draining the monthly budget in
 * one shot, and to absorb provider quota errors.
 *
 * Storage: Redis (ElastiCache) when REDIS_URL set, in-memory Map otherwise
 * (local dev / single-instance). The Redis Lua script is atomic; the in-memory
 * fallback is not multi-process safe but fine for tests.
 *
 * Budgets (monthly USD) live in budgetService; this is the *per-minute* axis.
 */
import { createHash } from "node:crypto";

export interface RateLimitConfig {
  tokensPerMinute: number; // refill rate
  burst: number; // max bucket size
}

export interface RateLimitRepo {
  /** Returns true when `cost` tokens fit in the bucket, false otherwise. Atomic. */
  consume(key: string, cost: number, cfg: RateLimitConfig, nowMs: number): Promise<boolean>;
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  "bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0": { tokensPerMinute: 40_000, burst: 80_000 },
  "bedrock:anthropic.claude-3-haiku-20240307-v1:0":    { tokensPerMinute: 100_000, burst: 200_000 },
  "mistral:mistral-large-latest":                       { tokensPerMinute: 30_000, burst: 60_000 },
  "openai:gpt-4o":                                      { tokensPerMinute: 30_000, burst: 60_000 },
};

function bucketKey(userId: string, providerModel: string): string {
  return `rl:${userId}:${createHash("sha1").update(providerModel).digest("hex").slice(0, 12)}`;
}

export class RateLimitService {
  constructor(private readonly repo: RateLimitRepo) {}

  async tryConsume(userId: string, providerModel: string, estimatedTokens: number): Promise<boolean> {
    const cfg = this.configFor(providerModel);
    return this.repo.consume(bucketKey(userId, providerModel), estimatedTokens, cfg, Date.now());
  }

  private configFor(providerModel: string): RateLimitConfig {
    const fromEnv = process.env[`RATE_LIMIT_${providerModel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`];
    if (fromEnv) {
      const [tpm, burst] = fromEnv.split(":").map(Number);
      if (Number.isFinite(tpm) && Number.isFinite(burst)) return { tokensPerMinute: tpm, burst };
    }
    return DEFAULTS[providerModel] ?? { tokensPerMinute: 60_000, burst: 120_000 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory repo (dev / tests). Replace with Redis in production.

export class InMemoryRateLimitRepo implements RateLimitRepo {
  private buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  async consume(key: string, cost: number, cfg: RateLimitConfig, nowMs: number): Promise<boolean> {
    const b = this.buckets.get(key) ?? { tokens: cfg.burst, lastRefillMs: nowMs };
    const elapsedMin = (nowMs - b.lastRefillMs) / 60_000;
    b.tokens = Math.min(cfg.burst, b.tokens + elapsedMin * cfg.tokensPerMinute);
    b.lastRefillMs = nowMs;
    if (b.tokens < cost) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= cost;
    this.buckets.set(key, b);
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Redis repo (production). Uses an atomic Lua script.

export const REDIS_BUCKET_LUA = `
local key   = KEYS[1]
local cost  = tonumber(ARGV[1])
local rate  = tonumber(ARGV[2])   -- tokens per minute
local burst = tonumber(ARGV[3])
local now   = tonumber(ARGV[4])   -- ms

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1]) or burst
local ts     = tonumber(data[2]) or now
local elapsed = (now - ts) / 60000.0
tokens = math.min(burst, tokens + elapsed * rate)

local ok = 0
if tokens >= cost then
  tokens = tokens - cost
  ok = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 3600000)
return ok
`;
