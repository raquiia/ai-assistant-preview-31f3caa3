import { describe, expect, it } from "vitest";
import { createDemoState } from "@mp/shared";
import { HybridRetriever, MockVectorProvider } from "./index.js";

describe("HybridRetriever", () => {
  it("returns grounded sources for project planning questions", async () => {
    const state = createDemoState();
    const vectorProvider = new MockVectorProvider();
    const retriever = new HybridRetriever(() => state.chunks, vectorProvider);
    await retriever.indexAll();
    const sources = await retriever.retrieve("retard planning chemin critique mitigation", { topK: 3, minScore: 20 });
    expect(sources[0]?.title).toBe("PMO Planning Handbook");
    expect(sources[0]?.score).toBeGreaterThan(20);
  });
});
