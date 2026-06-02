/**
 * OpenSearch Serverless vector adapter — drop-in replacement for MockVectorProvider.
 * Uses SigV4 signing with the task role credentials (no static keys).
 *
 * Index name is per-tenant prefix to allow safe multi-tenancy later. For now we
 * use a single index `kb-default` matching the dimension of the embedding model.
 */
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

export interface VectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorQuery {
  values: number[];
  topK: number;
  filter?: Record<string, unknown>;
}

export class OpenSearchVectorProvider {
  private readonly client: Client;
  private readonly index: string;
  private readonly dimension: number;

  constructor(opts: { endpoint: string; region: string; index?: string; dimension?: number }) {
    this.index = opts.index ?? "kb-default";
    this.dimension = opts.dimension ?? 1024;
    this.client = new Client({
      ...AwsSigv4Signer({
        region: opts.region,
        service: "aoss",
        getCredentials: () => defaultProvider()(),
      }),
      node: opts.endpoint,
    });
  }

  async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.index });
    if (exists.body) return;
    await this.client.indices.create({
      index: this.index,
      body: {
        settings: { index: { knn: true } },
        mappings: {
          properties: {
            embedding: {
              type: "knn_vector",
              dimension: this.dimension,
              method: { name: "hnsw", space_type: "cosinesimil", engine: "nmslib" },
            },
            metadata: { type: "object", enabled: true },
          },
        },
      },
    });
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const body = records.flatMap((r) => [
      { index: { _index: this.index, _id: r.id } },
      { embedding: r.values, metadata: r.metadata ?? {} },
    ]);
    await this.client.bulk({ body, refresh: true });
  }

  async query(query: VectorQuery): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
    const res = await this.client.search({
      index: this.index,
      body: {
        size: query.topK,
        query: {
          knn: {
            embedding: { vector: query.values, k: query.topK },
          },
        },
      },
    });
    const hits = (res.body.hits?.hits ?? []) as Array<{ _id: string; _score: number; _source: { metadata?: Record<string, unknown> } }>;
    return hits.map((h) => ({ id: h._id, score: h._score, metadata: h._source.metadata }));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const body = ids.flatMap((id) => [{ delete: { _index: this.index, _id: id } }]);
    await this.client.bulk({ body, refresh: true });
  }
}
