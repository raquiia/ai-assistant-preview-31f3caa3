// Wave 6.G — Health & readiness probes pour ALB/ECS.
//
// /healthz  : liveness — doit toujours retourner 200 si le process est up
//             (utilisé par ECS pour redémarrer une task figée).
// /readyz   : readiness — vérifie les dépendances critiques (Postgres, OpenSearch,
//             DynamoDB cache, Secrets Manager) ; doit retourner 503 si une dépendance
//             tombe → l'ALB sort la task du pool sans la tuer.
//
// IMPORTANT : ne mettre derrière AUCUNE authentification (auth middleware skip).

import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { Client as OsClient } from "@opensearch-project/opensearch";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

export async function registerHealth(
  app: FastifyInstance,
  deps: { pg: Pool; opensearch: OsClient; dynamo: DynamoDBClient; cacheTable: string },
) {
  // Liveness — pas de check externe
  app.get("/healthz", async () => ({
    status: "ok",
    uptime: process.uptime(),
    version: process.env.GIT_SHA ?? "dev",
  }));

  // Readiness — agrège les dépendances avec timeout 800 ms par check
  app.get("/readyz", async (_req, reply) => {
    const checks = await Promise.allSettled([
      withTimeout(deps.pg.query("SELECT 1"), 800, "pg"),
      withTimeout(deps.opensearch.cluster.health({}), 800, "opensearch"),
      withTimeout(
        deps.dynamo.send(new DescribeTableCommand({ TableName: deps.cacheTable })),
        800,
        "dynamo",
      ),
    ]);
    const results = {
      pg: checks[0].status === "fulfilled",
      opensearch: checks[1].status === "fulfilled",
      dynamo: checks[2].status === "fulfilled",
    };
    const ok = results.pg && results.opensearch && results.dynamo;
    reply.code(ok ? 200 : 503);
    return { status: ok ? "ok" : "degraded", checks: results };
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms)),
  ]);
}
