/**
 * OpenSearch Serverless vector adapter for the RAG pipeline.
 *
 * - Index `mp-chunks` holds chunk-level vectors + filterable metadata
 *   (industry / PM domain tags, language, page, section, documentId).
 * - SigV4 signed via task-role credentials, no static keys.
 * - Embedding generation happens upstream (BedrockEmbeddingsProvider);
 *   this adapter only writes / queries / deletes vectors.
 */
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

export interface ChunkWithEmbedding {
  chunkId: string;
  documentId: string;
  title: string;
  text: string;
  embedding: number[];
  page?: number;
  section?: string;
  language?: string;
  industryTags?: string[];
  pmDomainTags?: string[];
}

export interface VectorQuery {
  values: number[];
  topK: number;
  filter?: {
    industryTags?: string[];
    pmDomainTags?: string[];
    language?: string;
    documentId?: string;
  };
}

export interface VectorHit {
  chunkId: string;
  documentId: string;
  score: number;
  metadata: Record<string, unknown>;
}

export class OpenSearchVectorProvider {
  private readonly client: Client;
  private readonly index: string;
  private readonly dimension: number;

  constructor(opts: { endpoint: string; region: string; index?: string; dimension?: number }) {
    this.index = opts.index ?? "mp-chunks";
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
            chunkId: { type: "keyword" },
            documentId: { type: "keyword" },
            title: { type: "text" },
            text: { type: "text" },
            page: { type: "integer" },
            section: { type: "keyword" },
            language: { type: "keyword" },
            industryTags: { type: "keyword" },
            pmDomainTags: { type: "keyword" },
            embedding: {
              type: "knn_vector",
              dimension: this.dimension,
              method: { name: "hnsw", space_type: "cosinesimil", engine: "nmslib" },
            },
          },
        },
      },
    });
  }

  async upsertChunks(chunks: ChunkWithEmbedding[]): Promise<void> {
    if (chunks.length === 0) return;
    const body = chunks.flatMap((c) => [
      { index: { _index: this.index, _id: c.chunkId } },
      {
        chunkId: c.chunkId,
        documentId: c.documentId,
        title: c.title,
        text: c.text,
        embedding: c.embedding,
        page: c.page,
        section: c.section,
        language: c.language,
        industryTags: c.industryTags ?? [],
        pmDomainTags: c.pmDomainTags ?? [],
      },
    ]);
    await this.client.bulk({ body, refresh: true });
  }

  async search(query: VectorQuery): Promise<VectorHit[]> {
    const must: unknown[] = [
      { knn: { embedding: { vector: query.values, k: query.topK } } },
    ];
    const filter: unknown[] = [];
    if (query.filter?.industryTags?.length)
      filter.push({ terms: { industryTags: query.filter.industryTags } });
    if (query.filter?.pmDomainTags?.length)
      filter.push({ terms: { pmDomainTags: query.filter.pmDomainTags } });
    if (query.filter?.language) filter.push({ term: { language: query.filter.language } });
    if (query.filter?.documentId) filter.push({ term: { documentId: query.filter.documentId } });

    const res = await this.client.search({
      index: this.index,
      body: {
        size: query.topK,
        query: { bool: { must, filter } },
      },
    });
    const hits = (res.body.hits?.hits ?? []) as Array<{ _id: string; _score: number; _source: Record<string, unknown> }>;
    return hits.map((h) => ({
      chunkId: h._id,
      documentId: String(h._source.documentId ?? ""),
      score: h._score,
      metadata: h._source,
    }));
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.client.deleteByQuery({
      index: this.index,
      body: { query: { term: { documentId } } },
      refresh: true,
    });
  }

  async delete(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    const body = chunkIds.flatMap((id) => [{ delete: { _index: this.index, _id: id } }]);
    await this.client.bulk({ body, refresh: true });
  }
}
