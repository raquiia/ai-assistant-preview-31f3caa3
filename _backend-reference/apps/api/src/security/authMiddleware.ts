/**
 * Hybrid auth preHandler for Fastify.
 *
 * Vérifie en priorité un access token Cognito (signature JWKS + issuer + aud).
 * Si Cognito n'est pas configuré, ou si `ALLOW_LOCAL_AUTH=true` est posé
 * (mode dev / preview), retombe sur le HMAC local `verifyToken(... "access")`.
 *
 * En mode Cognito, les claims sont JIT-provisionnés en `User` applicatif
 * via `jitProvisionUser`, puis le rôle dérivé de `cognito:groups` est appliqué.
 *
 * `requireRole(...roles)` est un préHandler complémentaire : 403 + audit
 * `ACCESS_DENIED` si l'acteur n'a pas un des rôles demandés.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role, User } from "@mp/shared";
import { verifyToken } from "./tokens.js";
import type { CognitoAuthProvider } from "../providers/aws/cognito-auth.js";
import { jitProvisionUser, type JitRepo } from "../services/jitProvisioning.js";
import type { AppRepository } from "../state.js";

export interface AuthDeps {
  repo: AppRepository;
  cognitoAuth: CognitoAuthProvider | null;
  jitRepo: JitRepo;
  /** Default true en dev / preview, false en prod via env `ALLOW_LOCAL_AUTH`. */
  allowLocalAuth: boolean;
  audit: (e: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadataJson: Record<string, unknown>;
    ip: string | null;
    userAgent: string | null;
  }) => void;
}

const PENDING_MANAGER_ALLOWED = new Set<string>([
  "/auth/me",
  "/me",
  "/auth/logout",
  "/auth/first-visit/manager",
  "/managers/active",
]);

export function createAuth(deps: AuthDeps) {
  return async function auth(request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return reply.code(401).send({ error: "Unauthorized" });

    let actor: User | undefined;

    // 1) Try Cognito if configured.
    if (deps.cognitoAuth) {
      try {
        const claims = await deps.cognitoAuth.verify(header);
        if (claims["email_verified"] === false) {
          return reply.code(401).send({ error: "email_not_verified" });
        }
        const jit = await jitProvisionUser(claims, {
          repo: deps.jitRepo,
          audit: (e) =>
            deps.audit({
              ...e,
              ip: request.ip,
              userAgent: request.headers["user-agent"] ?? null,
            }),
        });
        actor = deps.repo.findUserById(jit.id);
      } catch (err) {
        // If local fallback is forbidden, reject immediately. Otherwise try HMAC.
        if (!deps.allowLocalAuth) {
          request.log.warn({ err }, "Cognito JWT verification failed");
          return reply.code(401).send({ error: "Unauthorized" });
        }
      }
    }

    // 2) Local HMAC fallback (dev / preview only).
    if (!actor && (deps.allowLocalAuth || !deps.cognitoAuth)) {
      try {
        const payload = verifyToken(token, "access");
        actor = deps.repo.findUserById(payload.sub);
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    }

    if (!actor || actor.status === "DISABLED") {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (
      actor.status === "PENDING_MANAGER" &&
      !PENDING_MANAGER_ALLOWED.has(request.routeOptions?.url ?? request.url)
    ) {
      return reply.code(403).send({ error: "Account pending manager approval" });
    }
    request.actor = actor;
  };
}

export function createOptionalAuth(deps: AuthDeps) {
  const auth = createAuth(deps);
  return async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
    if (!request.headers.authorization) return;
    // Swallow the reply by using a sentinel reply that doesn't actually send.
    try {
      await auth(request, reply);
    } catch {
      request.actor = undefined;
    }
  };
}

/**
 * 403 si l'acteur n'a pas l'un des rôles demandés. Doit être ajouté APRÈS
 * `auth` dans le tableau `preHandler`.
 */
export function requireRole(...roles: Role[]) {
  return async function check(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.actor;
    if (!actor) return reply.code(401).send({ error: "Unauthorized" });
    if (!roles.includes(actor.role)) {
      return reply.code(403).send({ error: "Forbidden", required: roles });
    }
  };
}
