import type { SourceCitation } from "@mp/shared";

export interface SearchProvider {
  readonly name: "mock" | "openai_hosted" | "tavily" | "serpapi" | "none";
  search(query: string, language: string): Promise<SourceCitation[]>;
}

export class MockSearchProvider implements SearchProvider {
  readonly name = "mock" as const;

  async search(query: string): Promise<SourceCitation[]> {
    if (!query.toLowerCase().includes("pmo") && !query.toLowerCase().includes("project")) return [];
    return [
      {
        chunkId: "web-mock-1",
        documentId: "web-mock",
        title: "Mock web search result",
        section: "SearchProvider",
        excerpt: "MockSearchProvider est actif uniquement pour demontrer le fallback web local. Configurez OpenAI hosted web search, Tavily ou SerpAPI pour des resultats reels.",
        score: 58,
        sourceUri: "mock://search/web-mock-1"
      }
    ];
  }
}

export class NoopSearchProvider implements SearchProvider {
  readonly name = "none" as const;
  async search(): Promise<SourceCitation[]> {
    return [];
  }
}

export class OpenAIHostedWebSearchProvider implements SearchProvider {
  readonly name = "openai_hosted" as const;

  constructor(
    private readonly apiKey?: string,
    private readonly model = "gpt-5.5"
  ) {}

  async search(query: string, language: string): Promise<SourceCitation[]> {
    if (!this.apiKey) return [];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        tools: [{ type: "web_search" }],
        input: `Find reliable web context for this internal assistant question. Language: ${language}. Query: ${query}`
      })
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { output_text?: string };
    const excerpt = json.output_text?.trim();
    if (!excerpt) return [];
    return [toCitation(this.name, "OpenAI hosted web search", excerpt, query, 60)];
  }
}

export class TavilySearchProvider implements SearchProvider {
  readonly name = "tavily" as const;

  constructor(private readonly apiKey?: string) {}

  async search(query: string): Promise<SourceCitation[]> {
    if (!this.apiKey) return [];
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.apiKey, query, max_results: 5, search_depth: "basic" })
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { results?: Array<{ title?: string; content?: string; url?: string; score?: number }> };
    return (json.results ?? []).slice(0, 5).map((result, index) => ({
      chunkId: `tavily-${index + 1}`,
      documentId: "tavily-search",
      title: result.title ?? "Tavily result",
      section: "web",
      excerpt: result.content ?? "",
      score: Math.round((result.score ?? 0.55) * 100),
      sourceUri: result.url ?? `tavily://search?q=${encodeURIComponent(query)}`
    }));
  }
}

export class SerpApiSearchProvider implements SearchProvider {
  readonly name = "serpapi" as const;

  constructor(private readonly apiKey?: string) {}

  async search(query: string): Promise<SourceCitation[]> {
    if (!this.apiKey) return [];
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", this.apiKey);
    const response = await fetch(url);
    if (!response.ok) return [];
    const json = (await response.json()) as { organic_results?: Array<{ title?: string; snippet?: string; link?: string }> };
    return (json.organic_results ?? []).slice(0, 5).map((result, index) => ({
      chunkId: `serpapi-${index + 1}`,
      documentId: "serpapi-search",
      title: result.title ?? "SerpAPI result",
      section: "web",
      excerpt: result.snippet ?? "",
      score: 55,
      sourceUri: result.link ?? `serpapi://search?q=${encodeURIComponent(query)}`
    }));
  }
}

function toCitation(provider: string, title: string, excerpt: string, query: string, score: number): SourceCitation {
  return {
    chunkId: `${provider}-${crypto.randomUUID()}`,
    documentId: `${provider}-search`,
    title,
    section: "web",
    excerpt,
    score,
    sourceUri: `${provider}://search?q=${encodeURIComponent(query)}`
  };
}
