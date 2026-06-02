import type { DocumentChunk, SourceCitation } from "@mp/shared";
import { tokenize, type VectorProvider } from "./vectorProvider.js";

export interface RetrievalOptions {
  topK: number;
  minScore: number;
  industryTags?: string[];
  pmDomainTags?: string[];
}

export class HybridRetriever {
  constructor(
    private readonly chunks: () => DocumentChunk[],
    private readonly vectorProvider: VectorProvider
  ) {}

  async indexAll(): Promise<void> {
    for (const chunk of this.chunks()) {
      const vector = await this.vectorProvider.embed(chunk.text);
      await this.vectorProvider.upsert(chunk.vectorId, vector, {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        language: chunk.language
      });
    }
  }

  async retrieve(query: string, options: RetrievalOptions): Promise<SourceCitation[]> {
    const allChunks = this.chunks().filter((chunk) => {
      const industryMatch = !options.industryTags?.length || options.industryTags.some((tag) => chunk.industryTags.includes(tag));
      const domainMatch = !options.pmDomainTags?.length || options.pmDomainTags.some((tag) => chunk.pmDomainTags.includes(tag));
      return industryMatch && domainMatch;
    });

    if (allChunks.length === 0) return [];

    const queryVector = await this.vectorProvider.embed(query);
    const vectorScores = await this.vectorProvider.search(queryVector, Math.max(options.topK * 3, 10));
    const vectorScoreById = new Map(vectorScores.map((item) => [item.id, item.score]));
    const queryTokens = new Set(tokenize(query));

    return allChunks
      .map((chunk) => {
        const keywordScore = keywordOverlap(queryTokens, new Set(tokenize(chunk.text))) * 100;
        const vectorScore = vectorScoreById.get(chunk.vectorId) ?? 0;
        const score = Math.round(Math.min(100, vectorScore * 0.62 + keywordScore * 0.38));
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          title: chunk.title,
          page: chunk.page,
          section: chunk.section,
          paragraph: chunk.paragraph,
          timeStart: chunk.timeStart,
          timeEnd: chunk.timeEnd,
          excerpt: chunk.text.length > 320 ? `${chunk.text.slice(0, 317)}...` : chunk.text,
          score,
          sourceUri: chunk.sourceUri
        } satisfies SourceCitation;
      })
      .filter((source) => source.score >= options.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }
}

function keywordOverlap(queryTokens: Set<string>, chunkTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  let matches = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) matches += 1;
  }
  return matches / queryTokens.size;
}
