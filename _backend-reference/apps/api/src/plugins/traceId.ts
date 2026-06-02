// Wave 6.F — TraceId middleware (Fastify).
//
// Génère ou reprend `X-Trace-Id` (envoyé par le front via src/lib/observability.ts),
// l'injecte dans le contexte pino + Sentry, et le retourne dans la réponse pour
// que le front puisse l'afficher à l'utilisateur en cas d'erreur (support L1/L2).

import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";
import { randomBytes } from "crypto";

function genTraceId(): string {
  return randomBytes(16).toString("hex");
}

export async function registerTraceId(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers["x-trace-id"];
    const traceId =
      typeof incoming === "string" && /^[0-9a-f]{32}$/i.test(incoming) ? incoming : genTraceId();
    (req as any).traceId = traceId;
    reply.header("X-Trace-Id", traceId);
    // pino enrichit chaque log
    (req as any).log = req.log.child({ traceId });
    // Sentry scope per-request
    Sentry.getCurrentScope().setTag("traceId", traceId);
  });
}
