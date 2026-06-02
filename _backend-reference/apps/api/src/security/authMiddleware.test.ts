import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createAuth, requireRole } from "./authMiddleware.js";
import type { AppRole } from "../providers/aws/cognito-auth.js";

function makeReply() {
  const reply = {
    statusCode: 200,
    body: undefined as unknown,
    code(c: number) {
      this.statusCode = c;
      return this;
    },
    send(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return reply as unknown as FastifyReply & { statusCode: number; body: unknown };
}

function makeRequest(authorization: string | undefined): FastifyRequest {
  return {
    headers: { authorization, "user-agent": "test" },
    ip: "127.0.0.1",
    log: { warn: vi.fn() } as never,
    routeOptions: { url: "/admin/kb/upload" },
    url: "/admin/kb/upload",
  } as unknown as FastifyRequest;
}

const baseDeps = {
  repo: {
    findUserById: (id: string) =>
      id === "user-admin"
        ? { id, role: "SUPER_ADMIN" as AppRole, status: "ACTIVE" }
        : id === "user-manager"
        ? { id, role: "MANAGER" as AppRole, status: "ACTIVE" }
        : null,
    audit: vi.fn(),
  } as never,
  jitRepo: {
    findById: vi.fn(async (id: string) => ({
      id,
      email: "x@x",
      name: "x",
      role: "SUPER_ADMIN" as AppRole,
      status: "ACTIVE" as const,
      managerId: null,
      department: null,
      language: "fr",
    })),
    create: vi.fn(),
    update: vi.fn(),
  } as never,
  audit: vi.fn(),
};

describe("createAuth", () => {
  it("401 sans header", async () => {
    const auth = createAuth({ ...baseDeps, cognitoAuth: null, allowLocalAuth: true });
    const reply = makeReply();
    await auth(makeRequest(undefined), reply);
    expect(reply.statusCode).toBe(401);
  });

  it("Cognito branché + bearer Cognito valide → actor injecté", async () => {
    const cognitoAuth = {
      verify: vi.fn(async () => ({
        sub: "user-admin",
        email: "a@a",
        email_verified: true,
        role: "SUPER_ADMIN" as AppRole,
        "cognito:groups": ["SUPER_ADMIN"],
      })),
    } as never;
    const auth = createAuth({ ...baseDeps, cognitoAuth, allowLocalAuth: false });
    const req = makeRequest("Bearer xxx");
    const reply = makeReply();
    await auth(req, reply);
    expect(reply.statusCode).toBe(200);
    expect((req as unknown as { actor: { id: string } }).actor.id).toBe("user-admin");
  });

  it("Cognito branché + token invalide + ALLOW_LOCAL_AUTH=false → 401", async () => {
    const cognitoAuth = {
      verify: vi.fn(async () => {
        throw new Error("bad signature");
      }),
    } as never;
    const auth = createAuth({ ...baseDeps, cognitoAuth, allowLocalAuth: false });
    const reply = makeReply();
    await auth(makeRequest("Bearer fake"), reply);
    expect(reply.statusCode).toBe(401);
  });

  it("email_verified=false → 401", async () => {
    const cognitoAuth = {
      verify: vi.fn(async () => ({
        sub: "user-admin",
        email: "a@a",
        email_verified: false,
        role: "SUPER_ADMIN" as AppRole,
        "cognito:groups": ["SUPER_ADMIN"],
      })),
    } as never;
    const auth = createAuth({ ...baseDeps, cognitoAuth, allowLocalAuth: false });
    const reply = makeReply();
    await auth(makeRequest("Bearer xxx"), reply);
    expect(reply.statusCode).toBe(401);
    expect((reply as unknown as { body: { error: string } }).body.error).toBe(
      "email_not_verified",
    );
  });
});

describe("requireRole", () => {
  it("403 si rôle absent", async () => {
    const guard = requireRole("SUPER_ADMIN");
    const req = makeRequest("Bearer x") as FastifyRequest & { actor: unknown };
    req.actor = { role: "MANAGER" } as never;
    const reply = makeReply();
    await guard(req, reply);
    expect(reply.statusCode).toBe(403);
  });

  it("passe si rôle présent", async () => {
    const guard = requireRole("SUPER_ADMIN", "MANAGER");
    const req = makeRequest("Bearer x") as FastifyRequest & { actor: unknown };
    req.actor = { role: "MANAGER" } as never;
    const reply = makeReply();
    await guard(req, reply);
    expect(reply.statusCode).toBe(200);
  });
});
