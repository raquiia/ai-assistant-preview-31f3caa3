import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { maskSecret } from "@mp/shared";

export interface SecretProvider {
  saveSecret(name: string, value: string): Promise<{ ref: string; masked: string | null }>;
  readSecret(ref: string): Promise<string | null>;
}

export class EnvEncryptedSecretProvider implements SecretProvider {
  private readonly secrets = new Map<string, string>();
  private readonly key = createHash("sha256").update(process.env.SECRET_ENCRYPTION_KEY ?? "local-secret-key").digest();

  async saveSecret(name: string, value: string): Promise<{ ref: string; masked: string | null }> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
    const ref = `local-secret://${name}/${crypto.randomUUID()}`;
    this.secrets.set(ref, payload);
    return { ref, masked: maskSecret(value) };
  }

  async readSecret(ref: string): Promise<string | null> {
    const payload = this.secrets.get(ref);
    if (!payload) return null;
    const bytes = Buffer.from(payload, "base64url");
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const encrypted = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
