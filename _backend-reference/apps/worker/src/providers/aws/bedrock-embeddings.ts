/**
 * Bedrock embeddings adapter — vectorizes text chunks for OpenSearch indexing.
 *
 * Default model: amazon.titan-embed-text-v2:0 (1024 dims, multilingual, low cost)
 * Fallback     : cohere.embed-multilingual-v3 (1024 dims) when Titan throttles
 *
 * Both models must be explicitly enabled in the AWS console for the target
 * region (Bedrock → Model access) — documented in DEPLOYMENT.md.
 */
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export interface BedrockEmbeddingsOptions {
  region: string;
  model?: string;
  fallbackModel?: string;
  dimensions?: number;
}

export class BedrockEmbeddingsProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;
  private readonly fallback: string;
  readonly dimensions: number;

  constructor(opts: BedrockEmbeddingsOptions) {
    this.client = new BedrockRuntimeClient({ region: opts.region });
    this.model = opts.model ?? "amazon.titan-embed-text-v2:0";
    this.fallback = opts.fallbackModel ?? "cohere.embed-multilingual-v3";
    this.dimensions = opts.dimensions ?? 1024;
  }

  async embed(text: string): Promise<number[]> {
    try {
      return await this.invoke(this.model, text);
    } catch (err) {
      if (this.isThrottling(err)) {
        console.warn(`[bedrock] ${this.model} throttled, falling back to ${this.fallback}`);
        return await this.invoke(this.fallback, text);
      }
      throw err;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Bedrock embeddings APIs are single-input; sequential w/ small concurrency.
    const out: number[][] = [];
    const concurrency = 4;
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const vecs = await Promise.all(batch.map((t) => this.embed(t)));
      out.push(...vecs);
    }
    return out;
  }

  private async invoke(model: string, text: string): Promise<number[]> {
    const body = model.startsWith("amazon.titan-embed")
      ? { inputText: text, dimensions: this.dimensions, normalize: true }
      : { texts: [text], input_type: "search_document" };

    const res = await this.client.send(
      new InvokeModelCommand({
        modelId: model,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(JSON.stringify(body)),
      })
    );
    const json = JSON.parse(Buffer.from(res.body).toString("utf8"));
    // Titan: { embedding: number[] } — Cohere: { embeddings: number[][] }
    return (json.embedding as number[]) ?? (json.embeddings?.[0] as number[]);
  }

  private isThrottling(err: unknown): boolean {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e?.name === "ThrottlingException" || e?.$metadata?.httpStatusCode === 429;
  }
}
