/**
 * Secrets Manager adapter with in-memory TTL cache (5 minutes).
 * Used to load AI provider keys and DATABASE_URL at runtime.
 */
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class SecretsManagerProvider {
  private readonly client: SecretsManagerClient;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60_000;

  constructor(region: string) {
    this.client = new SecretsManagerClient({ region });
  }

  async getString(arnOrName: string): Promise<string> {
    const hit = this.cache.get(arnOrName);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const res = await this.client.send(new GetSecretValueCommand({ SecretId: arnOrName }));
    const value = res.SecretString ?? Buffer.from(res.SecretBinary ?? "").toString("utf8");
    this.cache.set(arnOrName, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  async getJson<T = Record<string, unknown>>(arnOrName: string): Promise<T> {
    return JSON.parse(await this.getString(arnOrName)) as T;
  }

  invalidate(arnOrName?: string): void {
    if (arnOrName) this.cache.delete(arnOrName);
    else this.cache.clear();
  }
}
