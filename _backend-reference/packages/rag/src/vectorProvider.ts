export interface VectorProvider {
  embed(text: string): Promise<number[]>;
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;
  search(vector: number[], topK: number, filters?: Record<string, unknown>): Promise<Array<{ id: string; score: number }>>;
}

export class MockVectorProvider implements VectorProvider {
  private readonly vectors = new Map<string, { vector: number[]; metadata: Record<string, unknown> }>();

  async embed(text: string): Promise<number[]> {
    const buckets = new Array(32).fill(0) as number[];
    for (const token of tokenize(text)) {
      const index = Math.abs(hash(token)) % buckets.length;
      buckets[index] += 1;
    }
    const length = Math.sqrt(buckets.reduce((sum, value) => sum + value * value, 0)) || 1;
    return buckets.map((value) => value / length);
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    this.vectors.set(id, { vector, metadata });
  }

  async search(vector: number[], topK: number): Promise<Array<{ id: string; score: number }>> {
    return [...this.vectors.entries()]
      .map(([id, item]) => ({ id, score: cosine(vector, item.vector) * 100 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

export class OpenSearchVectorProvider implements VectorProvider {
  constructor(private readonly endpoint: string) {}

  async embed(text: string): Promise<number[]> {
    return new MockVectorProvider().embed(text);
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    await fetch(`${this.endpoint}/mp-document-chunks/_doc/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector, ...metadata, updatedAt: new Date().toISOString() })
    }).catch(() => undefined);
  }

  async search(_vector: number[], topK: number): Promise<Array<{ id: string; score: number }>> {
    await fetch(`${this.endpoint}/mp-document-chunks/_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size: topK, query: { match_all: {} } })
    }).catch(() => undefined);
    return [];
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return result;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }
  return dot / ((Math.sqrt(normA) || 1) * (Math.sqrt(normB) || 1));
}
