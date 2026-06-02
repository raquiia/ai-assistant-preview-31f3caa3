/**
 * AI Provider service — SuperAdmin-managed keys backed by AWS Secrets Manager.
 *
 * Each provider stores one secret under the prefix `mp/ai/<provider>` with JSON
 * payload `{ apiKey, model?, configJson? }`. Reads are cached in-memory for 5
 * minutes. Audit events are emitted on every mutation.
 *
 * Fallback: when Secrets Manager is not configured (no SECRETS_PREFIX), this
 * service degrades to env-var lookups (`MISTRAL_API_KEY`, `OPENAI_API_KEY`, …)
 * so local dev keeps working unchanged.
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-secrets-manager";

export type AiProviderName = "mistral" | "openai" | "tavily" | "serpapi";

export interface AiProviderPayload {
  apiKey: string;
  model?: string;
  configJson?: Record<string, unknown>;
}

export interface MaskedProvider {
  provider: AiProviderName;
  model?: string;
  configJson?: Record<string, unknown>;
  maskedKey: string;
  updatedAt: string;
}

interface CacheEntry {
  payload: AiProviderPayload;
  expiresAt: number;
}

export interface AuditSink {
  (event: {
    action: string;
    actorId: string | null;
    entityType: "AiProvider";
    entityId: string;
    metadataJson: Record<string, unknown>;
  }): void;
}

export class AiProviderService {
  private readonly client: SecretsManagerClient | null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60_000;
  private readonly prefix: string;

  constructor(opts: { region: string; prefix?: string; audit?: AuditSink }) {
    this.prefix = opts.prefix ?? process.env.SECRETS_PREFIX ?? "";
    this.client = this.prefix ? new SecretsManagerClient({ region: opts.region }) : null;
    this.audit = opts.audit ?? (() => undefined);
  }

  private readonly audit: AuditSink;

  private secretId(provider: AiProviderName): string {
    return `${this.prefix.replace(/\/$/, "")}/ai/${provider}`;
  }

  private mask(apiKey: string): string {
    if (apiKey.length <= 4) return "••••";
    return `••••••${apiKey.slice(-4)}`;
  }

  /** Read the raw key for runtime use. Falls back to env when AWS not wired. */
  async getKey(provider: AiProviderName): Promise<string | null> {
    if (!this.client) {
      return process.env[`${provider.toUpperCase()}_API_KEY`] ?? null;
    }
    const id = this.secretId(provider);
    const hit = this.cache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.payload.apiKey;
    try {
      const res = await this.client.send(new GetSecretValueCommand({ SecretId: id }));
      const payload = JSON.parse(res.SecretString ?? "{}") as AiProviderPayload;
      this.cache.set(id, { payload, expiresAt: Date.now() + this.ttlMs });
      return payload.apiKey ?? null;
    } catch (err) {
      if (err instanceof ResourceNotFoundException) return null;
      throw err;
    }
  }

  /** Return masked payloads for the SuperAdmin UI. */
  async list(): Promise<MaskedProvider[]> {
    const names: AiProviderName[] = ["mistral", "openai", "tavily", "serpapi"];
    const out: MaskedProvider[] = [];
    for (const name of names) {
      const payload = await this.read(name);
      if (!payload) continue;
      out.push({
        provider: name,
        model: payload.model,
        configJson: payload.configJson,
        maskedKey: this.mask(payload.apiKey),
        updatedAt: new Date().toISOString(),
      });
    }
    return out;
  }

  async upsert(
    provider: AiProviderName,
    payload: AiProviderPayload,
    actorId: string | null
  ): Promise<MaskedProvider> {
    if (!this.client) throw new Error("Secrets Manager not configured (SECRETS_PREFIX missing)");
    const id = this.secretId(provider);
    const body = JSON.stringify(payload);
    try {
      await this.client.send(new UpdateSecretCommand({ SecretId: id, SecretString: body }));
    } catch (err) {
      if (err instanceof ResourceNotFoundException) {
        await this.client.send(new CreateSecretCommand({ Name: id, SecretString: body }));
      } else {
        throw err;
      }
    }
    this.cache.delete(id);
    this.audit({
      action: "ai_provider.set",
      actorId,
      entityType: "AiProvider",
      entityId: provider,
      metadataJson: { model: payload.model },
    });
    return {
      provider,
      model: payload.model,
      configJson: payload.configJson,
      maskedKey: this.mask(payload.apiKey),
      updatedAt: new Date().toISOString(),
    };
  }

  async rotate(provider: AiProviderName, newKey: string, actorId: string | null): Promise<MaskedProvider> {
    const current = (await this.read(provider)) ?? { apiKey: "" };
    const next: AiProviderPayload = { ...current, apiKey: newKey };
    if (!this.client) throw new Error("Secrets Manager not configured");
    await this.client.send(
      new PutSecretValueCommand({ SecretId: this.secretId(provider), SecretString: JSON.stringify(next) })
    );
    this.cache.delete(this.secretId(provider));
    this.audit({
      action: "ai_provider.rotate",
      actorId,
      entityType: "AiProvider",
      entityId: provider,
      metadataJson: {},
    });
    return {
      provider,
      model: next.model,
      configJson: next.configJson,
      maskedKey: this.mask(newKey),
      updatedAt: new Date().toISOString(),
    };
  }

  async delete(provider: AiProviderName, actorId: string | null): Promise<void> {
    if (!this.client) throw new Error("Secrets Manager not configured");
    await this.client.send(
      new DeleteSecretCommand({
        SecretId: this.secretId(provider),
        RecoveryWindowInDays: 7,
      })
    );
    this.cache.delete(this.secretId(provider));
    this.audit({
      action: "ai_provider.delete",
      actorId,
      entityType: "AiProvider",
      entityId: provider,
      metadataJson: {},
    });
  }

  private async read(provider: AiProviderName): Promise<AiProviderPayload | null> {
    if (!this.client) {
      const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
      return apiKey ? { apiKey } : null;
    }
    const id = this.secretId(provider);
    const hit = this.cache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.payload;
    try {
      const res = await this.client.send(new GetSecretValueCommand({ SecretId: id }));
      const payload = JSON.parse(res.SecretString ?? "{}") as AiProviderPayload;
      this.cache.set(id, { payload, expiresAt: Date.now() + this.ttlMs });
      return payload;
    } catch (err) {
      if (err instanceof ResourceNotFoundException) return null;
      throw err;
    }
  }
}
