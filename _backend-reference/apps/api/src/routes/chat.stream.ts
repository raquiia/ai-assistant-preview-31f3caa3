// Wave 6.D — Streaming SSE pour /chat/conversations/:id/messages/stream
//
// Contrat HTTP côté Fastify (à brancher dans apps/api/src/routes/chat.ts) :
//   POST /chat/conversations/:id/messages/stream
//   body : { content: string, industryTags?: string[], pmDomainTags?: string[] }
//   réponse : text/event-stream avec frames SSE :
//     event: start   data: { conversationId }
//     event: sources data: { sources: SourceCitation[] }
//     event: token   data: { delta: string }
//     event: done    data: ChatAnswerPayload  // full payload (response/usage/cache/...)
//     event: error   data: { message: string }
//
// Côté frontend, src/mp/api.ts → ApiClient.streamChat() parse exactement ce format.
//
// Particularités :
// - Si le cache LLM (Wave 6.E, DynamoDB) HIT, on envoie un seul `token` avec
//   l'answer complète puis `done`, afin de garder l'UX SSE même sur 25 ms.
// - On flush() après chaque write pour éviter le buffering ALB/Cloudfront.
// - Headers requis pour traverser ALB sans bufferiser :
//     Cache-Control: no-cache, no-transform
//     X-Accel-Buffering: no
//     Connection: keep-alive

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { streamLlmAnswer } from "../services/llmStreamer";
import { llmCacheGet, llmCachePut, buildCacheKey } from "../services/llmCache";
import { requireAuth } from "../middleware/auth";

const Body = z.object({
  content: z.string().min(1).max(8000),
  industryTags: z.array(z.string().min(1).max(64)).max(20).optional(),
  pmDomainTags: z.array(z.string().min(1).max(64)).max(20).optional(),
});

export async function registerChatStream(app: FastifyInstance) {
  app.post("/chat/conversations/:id/messages/stream", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: conversationId } = req.params as { id: string };
    const body = Body.parse(req.body);

    // SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 15_000);
    req.raw.on("close", () => clearInterval(heartbeat));

    try {
      send("start", { conversationId });

      const cacheKey = buildCacheKey({
        provider: "mistral",
        model: "mistral-large-latest",
        question: body.content,
        filters: { industryTags: body.industryTags, pmDomainTags: body.pmDomainTags },
      });
      const cached = await llmCacheGet(cacheKey);
      if (cached) {
        send("sources", { sources: cached.sources });
        send("token", { delta: cached.answer });
        send("done", { ...cached, cache: { hit: true, key: cacheKey, ageSeconds: cached.cache?.ageSeconds ?? 0 } });
        return reply.raw.end();
      }

      const result = await streamLlmAnswer({
        userId: (req as any).user.id,
        conversationId,
        question: body.content,
        filters: { industryTags: body.industryTags, pmDomainTags: body.pmDomainTags },
        onSources: (sources) => send("sources", { sources }),
        onToken: (delta) => send("token", { delta }),
      });

      await llmCachePut(cacheKey, result);
      send("done", { ...result, cache: { hit: false, key: cacheKey, ageSeconds: 0 } });
      reply.raw.end();
    } catch (err) {
      send("error", { message: err instanceof Error ? err.message : "stream failed" });
      reply.raw.end();
    } finally {
      clearInterval(heartbeat);
    }
  });
}
