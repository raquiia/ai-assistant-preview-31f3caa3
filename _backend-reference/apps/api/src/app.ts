import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { env } from "@mp/config";
import {
  assertRole,
  canEditPrompts,
  canManageUsers,
  canUploadKnowledge,
  canViewAudit,
  canViewConversation,
  detectLanguage,
  type FeedbackRating,
  type Role,
  type User
} from "@mp/shared";
import { chunkDocument } from "@mp/rag";
import { AppRepository } from "./state.js";
import { EnvEncryptedSecretProvider } from "./security/secretProvider.js";
import { signToken, verifyToken } from "./security/tokens.js";
import { hashPassword, verifyDemoPassword } from "./security/passwords.js";
import { ChatService } from "./services/chatService.js";

declare module "fastify" {
  interface FastifyRequest {
    actor?: User;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  const repo = new AppRepository();
  const secrets = new EnvEncryptedSecretProvider();
  const chat = new ChatService(repo);
  await repo.ready();

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin || origin === env.appOrigin || repo.state.settings.allowedEmbedOrigins.includes(origin)) cb(null, true);
      else cb(new Error("Origin not allowed"), false);
    },
    credentials: true
  });
  await app.register(rateLimit, { max: Number(process.env.RATE_LIMIT_MAX ?? 120), timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute" });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.addHook("onRequest", async (_request, reply) => {
    const frameAncestors = ["'self'", ...repo.state.settings.allowedEmbedOrigins].join(" ");
    reply.header("Content-Security-Policy", `default-src 'self'; connect-src 'self' ${env.appOrigin}; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors ${frameAncestors}`);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "microphone=(self), camera=(), geolocation=()");
  });

  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode === 403) {
      repo.audit({
        actorId: request.actor?.id ?? null,
        action: "ACCESS_DENIED",
        entityType: "Route",
        entityId: request.url,
        metadataJson: { method: request.method },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "mp-ai-assistant-api",
    time: new Date().toISOString()
  }));

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const user = body.email ? repo.findUserByEmail(body.email) : undefined;
    if (!user || !body.password || !(await verifyDemoPassword(body.password))) {
      repo.audit({
        actorId: null,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: body.email ?? null,
        metadataJson: {},
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    repo.audit({
      actorId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "User",
      entityId: user.id,
      metadataJson: { role: user.role },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return {
      user,
      accessToken: signToken(user.id, "access", 60 * 60),
      refreshToken: signToken(user.id, "refresh", 60 * 60 * 24 * 14)
    };
  });

  app.post("/auth/refresh", async (request, reply) => {
    try {
      const body = request.body as { refreshToken?: string };
      const payload = verifyToken(body.refreshToken ?? "", "refresh");
      const user = repo.findUserById(payload.sub);
      if (!user) throw new Error("User not found");
      return { accessToken: signToken(user.id, "access", 60 * 60), user };
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }
  });

  app.post("/auth/logout", { preHandler: auth(repo) }, async (request) => {
    repo.audit({
      actorId: request.actor!.id,
      action: "LOGOUT",
      entityType: "User",
      entityId: request.actor!.id,
      metadataJson: {},
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: auth(repo) }, async (request) => ({ user: request.actor }));

  app.post("/auth/first-visit/manager", { preHandler: auth(repo) }, async (request, reply) => {
    const actor = request.actor!;
    const body = request.body as { managerId?: string };
    if (actor.role !== "CONSULTANT") return reply.code(400).send({ error: "Only consultants select a manager" });
    const manager = repo.state.users.find((user) => user.id === body.managerId && user.role === "MANAGER" && user.status === "ACTIVE");
    if (!manager) return reply.code(404).send({ error: "Manager not found" });
    actor.managerId = manager.id;
    actor.status = "ACTIVE";
    actor.updatedAt = new Date().toISOString();
    repo.audit({
      actorId: actor.id,
      action: "MANAGER_SELECTED",
      entityType: "User",
      entityId: actor.id,
      metadataJson: { managerId: manager.id },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { user: actor };
  });

  app.get("/managers/active", { preHandler: auth(repo) }, async () => ({
    managers: repo.state.users.filter((user) => user.role === "MANAGER" && user.status === "ACTIVE")
  }));

  // Self-registration: a consultant creates an account and selects a manager.
  // The account is created in PENDING_MANAGER and waits for the manager to approve.
  app.post("/auth/register", async (request, reply) => {
    const body = request.body as {
      email?: string;
      password?: string;
      name?: string;
      managerId?: string;
      department?: string | null;
      language?: string;
    };
    if (!body.email || !body.password || !body.name || !body.managerId) {
      return reply.code(400).send({ error: "email, password, name and managerId are required" });
    }
    if (body.password.length < 8) {
      return reply.code(400).send({ error: "password must be at least 8 characters" });
    }
    if (repo.findUserByEmail(body.email)) {
      return reply.code(409).send({ error: "email already in use" });
    }
    const manager = repo.state.users.find(
      (user) => user.id === body.managerId && user.role === "MANAGER" && user.status === "ACTIVE"
    );
    if (!manager) return reply.code(404).send({ error: "Manager not found or inactive" });

    const now = new Date().toISOString();
    const user: User & { passwordHash?: string } = {
      id: `usr-${crypto.randomUUID()}`,
      email: body.email,
      name: body.name,
      role: "CONSULTANT",
      managerId: manager.id,
      language: body.language ?? "fr",
      status: "PENDING_MANAGER",
      department: body.department ?? manager.department ?? null,
      createdAt: now,
      updatedAt: now,
      passwordHash: await hashPassword(body.password)
    } as User & { passwordHash?: string };
    repo.state.users.push(user);
    repo.audit({
      actorId: user.id,
      action: "USER_REGISTERED",
      entityType: "User",
      entityId: user.id,
      metadataJson: { managerId: manager.id, status: "PENDING_MANAGER" },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return {
      user,
      accessToken: signToken(user.id, "access", 60 * 60),
      refreshToken: signToken(user.id, "refresh", 60 * 60 * 24 * 14)
    };
  });

  // Manager approval workflow
  app.get("/managers/me/pending-consultants", { preHandler: auth(repo) }, async (request, reply) => {
    const actor = request.actor!;
    if (actor.role !== "MANAGER" && actor.role !== "SUPER_ADMIN") {
      return reply.code(403).send({ error: "Access denied" });
    }
    const pending = repo.state.users.filter(
      (user) =>
        user.role === "CONSULTANT" &&
        user.status === "PENDING_MANAGER" &&
        (actor.role === "SUPER_ADMIN" || user.managerId === actor.id)
    );
    return { consultants: pending };
  });

  app.post("/managers/consultants/:id/approve", { preHandler: auth(repo) }, async (request, reply) => {
    const actor = request.actor!;
    if (actor.role !== "MANAGER" && actor.role !== "SUPER_ADMIN") {
      return reply.code(403).send({ error: "Access denied" });
    }
    const { id } = request.params as { id: string };
    const target = repo.findUserById(id);
    if (!target || target.role !== "CONSULTANT") {
      return reply.code(404).send({ error: "Consultant not found" });
    }
    if (actor.role === "MANAGER" && target.managerId !== actor.id) {
      return reply.code(403).send({ error: "Consultant is not attached to this manager" });
    }
    target.status = "ACTIVE";
    target.updatedAt = new Date().toISOString();
    repo.audit({
      actorId: actor.id,
      action: "CONSULTANT_APPROVED",
      entityType: "User",
      entityId: target.id,
      metadataJson: { managerId: target.managerId },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { user: target };
  });

  app.post("/managers/consultants/:id/reject", { preHandler: auth(repo) }, async (request, reply) => {
    const actor = request.actor!;
    if (actor.role !== "MANAGER" && actor.role !== "SUPER_ADMIN") {
      return reply.code(403).send({ error: "Access denied" });
    }
    const { id } = request.params as { id: string };
    const body = (request.body as { reason?: string } | undefined) ?? {};
    const target = repo.findUserById(id);
    if (!target || target.role !== "CONSULTANT") {
      return reply.code(404).send({ error: "Consultant not found" });
    }
    if (actor.role === "MANAGER" && target.managerId !== actor.id) {
      return reply.code(403).send({ error: "Consultant is not attached to this manager" });
    }
    target.status = "DISABLED";
    target.updatedAt = new Date().toISOString();
    repo.audit({
      actorId: actor.id,
      action: "CONSULTANT_REJECTED",
      entityType: "User",
      entityId: target.id,
      metadataJson: { managerId: target.managerId, reason: body.reason ?? null },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { user: target };
  });

  app.get("/notifications/pending-count", { preHandler: auth(repo) }, async (request) => {
    const actor = request.actor!;
    if (actor.role === "MANAGER") {
      const count = repo.state.users.filter(
        (user) =>
          user.role === "CONSULTANT" &&
          user.status === "PENDING_MANAGER" &&
          user.managerId === actor.id
      ).length;
      return { pendingConsultants: count };
    }
    if (actor.role === "SUPER_ADMIN") {
      const count = repo.state.users.filter(
        (user) => user.role === "CONSULTANT" && user.status === "PENDING_MANAGER"
      ).length;
      return { pendingConsultants: count };
    }
    return { pendingConsultants: 0 };
  });



  app.post("/chat/conversations", { preHandler: auth(repo) }, async (request) => {
    const body = request.body as { title?: string; language?: string; channel?: "WEB" | "EMBED" | "API" };
    return { conversation: chat.createConversation(request.actor!, body.title, body.language, body.channel ?? "WEB") };
  });

  app.get("/chat/conversations", { preHandler: auth(repo) }, async (request) => ({
    conversations: repo.state.conversations.filter((conversation) => canViewConversation(request.actor!, conversation))
  }));

  app.get("/chat/conversations/:id", { preHandler: auth(repo) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = repo.state.conversations.find((item) => item.id === id);
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (!canViewConversation(request.actor!, conversation)) return reply.code(403).send({ error: "Access denied" });
    return {
      conversation,
      messages: repo.state.messages.filter((message) => message.conversationId === id),
      responses: repo.state.responses.filter((response) => repo.state.messages.some((message) => message.id === response.messageId && message.conversationId === id))
    };
  });

  app.post("/chat/conversations/:id/messages", { preHandler: auth(repo) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { content: string };
    return chat.answer(request.actor!, id, body.content);
  });

  app.post("/chat/messages/:id/attachments", { preHandler: auth(repo) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = repo.state.messages.find((item) => item.id === id);
    if (!message) return reply.code(404).send({ error: "Message not found" });
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Missing file" });
    const buffer = await file.toBuffer();
    const attachment = {
      id: `att-${crypto.randomUUID()}`,
      messageId: id,
      objectKey: `attachments/${id}/${file.filename}`,
      fileName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: buffer.length,
      status: "UPLOADED" as const,
      extractedTextRef: null
    };
    repo.audit({
      actorId: request.actor!.id,
      action: "ATTACHMENT_UPLOADED",
      entityType: "Attachment",
      entityId: attachment.id,
      metadataJson: { fileName: file.filename, mimeType: file.mimetype, sizeBytes: buffer.length },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { attachment };
  });

  app.post("/chat/responses/:id/feedback", { preHandler: auth(repo) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { rating: FeedbackRating; comment?: string };
    return chat.addFeedback(request.actor!, id, body.rating, body.comment);
  });

  app.post("/chat/responses/:id/retry-fallback", { preHandler: auth(repo) }, async (request) => {
    const { id } = request.params as { id: string };
    return chat.retryFallback(request.actor!, id);
  });

  app.post("/admin/kb/upload", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canUploadKnowledge(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "Missing file" });
      const buffer = await file.toBuffer();
      const text = file.mimetype.startsWith("text/") ? buffer.toString("utf8") : "";
      return chat.ingestKnowledge(request.actor!, {
        title: file.filename,
        text,
        mimeType: file.mimetype,
        objectKey: `kb/${crypto.randomUUID()}-${file.filename}`
      });
    }
    const body = request.body as { title?: string; text?: string; mimeType?: string };
    if (!body.title || !body.mimeType) return reply.code(400).send({ error: "Missing title or mimeType" });
    return chat.ingestKnowledge(request.actor!, { title: body.title, text: body.text ?? "", mimeType: body.mimeType });
  });

  app.get("/admin/kb/documents", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canUploadKnowledge(request.actor!) && !canViewAudit(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { documents: repo.state.documents };
  });

  app.get("/admin/kb/documents/:id", { preHandler: auth(repo) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const document = repo.state.documents.find((item) => item.id === id);
    if (!document) return reply.code(404).send({ error: "Document not found" });
    return { document, chunks: repo.state.chunks.filter((chunk) => chunk.documentId === id) };
  });

  app.post("/admin/kb/documents/:id/reindex", { preHandler: auth(repo) }, async (request, reply) => {
    if (request.actor!.role !== "SUPER_ADMIN") return reply.code(403).send({ error: "Access denied" });
    await repo.retriever.indexAll();
    return { ok: true };
  });

  app.post("/admin/kb/documents/:id/publish", { preHandler: auth(repo) }, async (request, reply) => {
    if (request.actor!.role !== "SUPER_ADMIN") return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const document = repo.state.documents.find((item) => item.id === id);
    if (!document) return reply.code(404).send({ error: "Document not found" });
    document.status = "PUBLISHED";
    repo.audit({
      actorId: request.actor!.id,
      action: "DOCUMENT_PUBLISHED",
      entityType: "Document",
      entityId: id,
      metadataJson: {},
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    await repo.retriever.indexAll();
    return { document };
  });

  app.get("/source/:chunkId", { preHandler: optionalAuth(repo) }, async (request, reply) => {
    const { chunkId } = request.params as { chunkId: string };
    const chunk = repo.state.chunks.find((item) => item.id === chunkId);
    if (!chunk) return reply.code(404).send({ error: "Source not found" });
    return {
      chunk,
      viewer: {
        title: chunk.title,
        highlight: { charStart: chunk.charStart, charEnd: chunk.charEnd, paragraph: chunk.paragraph, timeStart: chunk.timeStart, timeEnd: chunk.timeEnd },
        metadata: {
          page: chunk.page,
          section: chunk.section,
          language: chunk.language,
          industryTags: chunk.industryTags,
          pmDomainTags: chunk.pmDomainTags
        }
      }
    };
  });

  app.get("/admin/history", { preHandler: auth(repo) }, async (request, reply) => {
    if (request.actor!.role === "CONSULTANT") return reply.code(403).send({ error: "Access denied" });
    const rows = repo.state.responses
      .map((response) => toHistoryRow(repo, response.id))
      .filter((row) => row && (request.actor!.role === "SUPER_ADMIN" || request.actor!.role === "AUDITOR" || row.managerId === request.actor!.id));
    return { rows };
  });

  app.get("/admin/history/:responseId", { preHandler: auth(repo) }, async (request, reply) => {
    const { responseId } = request.params as { responseId: string };
    const row = toHistoryRow(repo, responseId);
    if (!row) return reply.code(404).send({ error: "Response not found" });
    if (request.actor!.role !== "SUPER_ADMIN" && request.actor!.role !== "AUDITOR" && row.managerId !== request.actor!.id) {
      return reply.code(403).send({ error: "Access denied" });
    }
    return row;
  });

  app.post("/admin/history/:responseId/comment", { preHandler: auth(repo) }, async (request, reply) => {
    assertRole(request.actor!, ["MANAGER", "SUPER_ADMIN"]);
    const { responseId } = request.params as { responseId: string };
    const body = request.body as { comment?: string; status?: "DRAFT" | "APPROVED" };
    if (!body.comment) return reply.code(400).send({ error: "Missing comment" });
    const adminComment = {
      id: `comment-${crypto.randomUUID()}`,
      responseId,
      adminId: request.actor!.id,
      comment: body.comment,
      status: body.status ?? "DRAFT",
      createdAt: new Date().toISOString()
    };
    repo.state.adminComments.push(adminComment);
    if (adminComment.status === "APPROVED") {
      const correction = {
        id: `kc-${crypto.randomUUID()}`,
        adminCommentId: adminComment.id,
        title: `Correction ${responseId}`,
        content: adminComment.comment,
        tags: ["Approved Guidance", "Knowledge Corrections"],
        status: "ACTIVE" as const,
        approvedById: request.actor!.id,
        activatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      repo.state.corrections.push(correction);
      const correctionChunks = chunkDocument({
        documentId: correction.id,
        title: correction.title,
        version: 1,
        text: correction.content,
        language: detectLanguage(correction.content, request.actor!.language)
      });
      repo.state.chunks.push(...correctionChunks);
      await repo.retriever.indexAll();
    }
    repo.audit({
      actorId: request.actor!.id,
      action: "ADMIN_COMMENT_CREATED",
      entityType: "AdminComment",
      entityId: adminComment.id,
      metadataJson: { status: adminComment.status, responseId },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { adminComment, corrections: repo.state.corrections.filter((correction) => correction.adminCommentId === adminComment.id) };
  });

  app.get("/superadmin/corrections", { preHandler: auth(repo) }, async (request, reply) => {
    if (request.actor!.role !== "SUPER_ADMIN") return reply.code(403).send({ error: "Access denied" });
    return {
      corrections: repo.state.corrections
        .map((correction) => ({
          ...correction,
          adminComment: repo.state.adminComments.find((comment) => comment.id === correction.adminCommentId) ?? null,
          approvedBy: correction.approvedById ? repo.findUserById(correction.approvedById) ?? null : null
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    };
  });

  app.post("/admin/history/:responseId/translate", { preHandler: auth(repo) }, async (request) => {
    const { responseId } = request.params as { responseId: string };
    const body = request.body as { language?: string };
    const row = toHistoryRow(repo, responseId);
    return {
      responseId,
      language: body.language ?? "en",
      question: `[${body.language ?? "en"} translation] ${row?.question ?? ""}`,
      answer: `[${body.language ?? "en"} translation] ${row?.answer ?? ""}`
    };
  });

  app.get("/admin/dashboard", { preHandler: auth(repo) }, async (request, reply) => {
    if (request.actor!.role === "CONSULTANT") return reply.code(403).send({ error: "Access denied" });
    const responses = repo.state.responses;
    const latencies = responses.map((response) => response.latencyMs).sort((a, b) => a - b);
    return {
      kpis: {
        questions: responses.length,
        activeUsers: repo.state.users.filter((user) => user.status === "ACTIVE").length,
        fallbackRate: percent(responses.filter((response) => response.fallbackUsed).length, responses.length),
        escalationRate: percent(responses.filter((response) => response.escalationTriggered).length, responses.length),
        latencyP50: percentile(latencies, 0.5),
        latencyP95: percentile(latencies, 0.95),
        estimatedCost: repo.state.usages.reduce((sum, usage) => sum + usage.estimatedCost, 0)
      },
      metrics: repo.state.metrics
    };
  });

  app.get("/superadmin/users", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { users: repo.state.users };
  });

  app.post("/superadmin/users", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const body = request.body as Partial<User> & { role?: Role };
    if (!body.email || !body.name || !body.role) return reply.code(400).send({ error: "Missing email, name or role" });
    const user: User = {
      id: `usr-${crypto.randomUUID()}`,
      email: body.email,
      name: body.name,
      role: body.role,
      managerId: body.managerId ?? null,
      language: body.language ?? "fr",
      status: body.status ?? "ACTIVE",
      department: body.department ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    repo.state.users.push(user);
    return { user };
  });

  app.patch("/superadmin/users/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const user = repo.findUserById(id);
    if (!user) return reply.code(404).send({ error: "User not found" });
    Object.assign(user, request.body as Partial<User>, { updatedAt: new Date().toISOString() });
    return { user };
  });

  app.delete("/superadmin/users/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const user = repo.findUserById(id);
    if (!user) return reply.code(404).send({ error: "User not found" });
    user.status = "DISABLED";
    user.updatedAt = new Date().toISOString();
    repo.audit({
      actorId: request.actor!.id,
      action: "USER_DISABLED",
      entityType: "User",
      entityId: id,
      metadataJson: {},
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { user };
  });

  app.get("/superadmin/managers", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { managers: repo.state.managerProfiles.map((profile) => ({ ...profile, user: repo.findUserById(profile.userId) })) };
  });

  app.post("/superadmin/managers", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const body = request.body as { userId?: string; department?: string };
    const user = body.userId ? repo.findUserById(body.userId) : undefined;
    if (!user || user.role !== "MANAGER") return reply.code(400).send({ error: "Manager user not found" });
    const profile = {
      id: `mgr-${crypto.randomUUID()}`,
      userId: user.id,
      department: body.department ?? user.department ?? "PMO",
      active: true
    };
    repo.state.managerProfiles.push(profile);
    return { manager: profile };
  });

  app.patch("/superadmin/managers/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const profile = repo.state.managerProfiles.find((item) => item.id === id);
    if (!profile) return reply.code(404).send({ error: "Manager profile not found" });
    Object.assign(profile, request.body as Partial<typeof profile>);
    return { manager: profile };
  });

  app.delete("/superadmin/managers/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const profile = repo.state.managerProfiles.find((item) => item.id === id);
    if (!profile) return reply.code(404).send({ error: "Manager profile not found" });
    profile.active = false;
    return { manager: profile };
  });

  app.get("/superadmin/prompts", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canEditPrompts(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { prompts: repo.state.prompts };
  });

  app.post("/superadmin/prompts", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canEditPrompts(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const body = request.body as { name?: string; content?: string; configJson?: Record<string, unknown>; active?: boolean };
    if (!body.name || !body.content) return reply.code(400).send({ error: "Missing prompt fields" });
    if (body.active) repo.state.prompts.forEach((prompt) => (prompt.active = false));
    const prompt = {
      id: `prompt-${crypto.randomUUID()}`,
      name: body.name,
      content: body.content,
      configJson: body.configJson ?? {},
      createdById: request.actor!.id,
      active: Boolean(body.active),
      createdAt: new Date().toISOString()
    };
    repo.state.prompts.push(prompt);
    repo.audit({
      actorId: request.actor!.id,
      action: "PROMPT_VERSION_CREATED",
      entityType: "PromptVersion",
      entityId: prompt.id,
      metadataJson: { active: prompt.active },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { prompt };
  });

  app.post("/superadmin/prompts/:id/rollback", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canEditPrompts(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const prompt = repo.state.prompts.find((item) => item.id === id);
    if (!prompt) return reply.code(404).send({ error: "Prompt not found" });
    repo.state.prompts.forEach((item) => (item.active = false));
    prompt.active = true;
    repo.audit({
      actorId: request.actor!.id,
      action: "PROMPT_ROLLBACK",
      entityType: "PromptVersion",
      entityId: prompt.id,
      metadataJson: {},
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { prompt };
  });

  app.delete("/superadmin/prompts/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canEditPrompts(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const prompt = repo.state.prompts.find((item) => item.id === id);
    if (!prompt) return reply.code(404).send({ error: "Prompt not found" });
    prompt.active = false;
    return { prompt };
  });

  app.get("/superadmin/ai-providers", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { providers: repo.maskedProviderConfigs() };
  });

  app.post("/superadmin/ai-providers", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const body = request.body as { provider?: "mistral" | "openai" | "search"; apiKey?: string; model?: string; active?: boolean; configJson?: Record<string, unknown> };
    if (!body.provider || !body.model) return reply.code(400).send({ error: "Missing provider or model" });
    const stored = body.apiKey ? await secrets.saveSecret(body.provider, body.apiKey) : { ref: null, masked: null };
    const config = {
      id: `provider-${crypto.randomUUID()}`,
      provider: body.provider,
      encryptedApiKeyRef: stored.ref,
      model: body.model,
      configJson: body.configJson ?? {},
      active: body.active ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      maskedKey: stored.masked
    };
    repo.state.providerConfigs.push(config);
    repo.audit({
      actorId: request.actor!.id,
      action: "API_KEY_CONFIG_CHANGED",
      entityType: "AiProviderConfig",
      entityId: config.id,
      metadataJson: { provider: config.provider, hasKey: Boolean(body.apiKey) },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { provider: { ...config, encryptedApiKeyRef: config.encryptedApiKeyRef ? "stored" : null } };
  });

  app.patch("/superadmin/ai-providers/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const config = repo.state.providerConfigs.find((item) => item.id === id);
    if (!config) return reply.code(404).send({ error: "Provider config not found" });
    const body = request.body as { apiKey?: string; model?: string; active?: boolean; configJson?: Record<string, unknown> };
    if (body.apiKey) {
      const stored = await secrets.saveSecret(config.provider, body.apiKey);
      config.encryptedApiKeyRef = stored.ref;
      config.maskedKey = stored.masked;
    }
    if (body.model) config.model = body.model;
    if (typeof body.active === "boolean") config.active = body.active;
    if (body.configJson) config.configJson = body.configJson;
    config.updatedAt = new Date().toISOString();
    return { provider: { ...config, encryptedApiKeyRef: config.encryptedApiKeyRef ? "stored" : null } };
  });

  app.delete("/superadmin/ai-providers/:id", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const config = repo.state.providerConfigs.find((item) => item.id === id);
    if (!config) return reply.code(404).send({ error: "Provider config not found" });
    config.active = false;
    config.updatedAt = new Date().toISOString();
    return { provider: { ...config, encryptedApiKeyRef: config.encryptedApiKeyRef ? "stored" : null } };
  });

  // Test connectivity / validity of a stored provider API key.
  // Returns latency, currently reachable status, and a timestamp.
  app.post("/superadmin/ai-providers/:id/test", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    const { id } = request.params as { id: string };
    const config = repo.state.providerConfigs.find((item) => item.id === id);
    if (!config) return reply.code(404).send({ error: "Provider config not found" });

    const startedAt = Date.now();
    let ok = false;
    let message: string | null = null;
    try {
      const apiKey = config.encryptedApiKeyRef ? await secrets.readSecret(config.encryptedApiKeyRef) : null;
      if (!apiKey) {
        message = "No API key configured";
      } else if (config.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        ok = res.ok;
        if (!res.ok) message = `HTTP ${res.status}`;
      } else if (config.provider === "mistral") {
        const res = await fetch("https://api.mistral.ai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        ok = res.ok;
        if (!res.ok) message = `HTTP ${res.status}`;
      } else {
        // search providers: assume ok if a key is stored
        ok = true;
      }
    } catch (error) {
      message = error instanceof Error ? error.message : "Unknown error";
    }
    const latencyMs = Date.now() - startedAt;
    const checkedAt = new Date().toISOString();
    repo.audit({
      actorId: request.actor!.id,
      action: "PROVIDER_TEST",
      entityType: "AiProviderConfig",
      entityId: config.id,
      metadataJson: { ok, latencyMs, message },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { ok, latencyMs, checkedAt, message };
  });

  app.get("/superadmin/audit/events", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canViewAudit(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { events: repo.state.auditEvents };
  });

  app.get("/superadmin/compliance/system-card", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canViewAudit(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return {
      systemCard: {
        purpose: "Assistant interne MIGSO-PCUBED pour consultants PMO et Project Controls.",
        users: ["CONSULTANT", "MANAGER", "SUPER_ADMIN", "AUDITOR"],
        dataProcessed: ["questions", "responses", "documents", "feedback", "audit events"],
        models: repo.state.providerConfigs.map((config) => ({ provider: config.provider, model: config.model, active: config.active })),
        risks: ["hallucination", "prompt injection", "PII exposure", "out-of-scope advice"],
        controls: ["source requirement", "human escalation", "RBAC", "audit logging", "secret masking"],
        reviewedAt: new Date().toISOString()
      }
    };
  });

  app.post("/superadmin/compliance/export", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canViewAudit(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { exportedAt: new Date().toISOString(), format: "json", data: repo.state };
  });

  app.get("/superadmin/settings", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    return { settings: repo.state.settings };
  });

  app.patch("/superadmin/settings", { preHandler: auth(repo) }, async (request, reply) => {
    if (!canManageUsers(request.actor!)) return reply.code(403).send({ error: "Access denied" });
    Object.assign(repo.state.settings, request.body as Record<string, unknown>);
    repo.audit({
      actorId: request.actor!.id,
      action: "SETTINGS_CHANGED",
      entityType: "Settings",
      entityId: "global",
      metadataJson: request.body as Record<string, unknown>,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    return { settings: repo.state.settings };
  });

  app.get("/embed/chat", async (request, reply) => {
    if (!isAllowedEmbedOrigin(request, repo)) return reply.code(403).send({ error: "Embed origin not allowed" });
    reply.type("text/html");
    return `<!doctype html><html><head><title>MIGSO-PCUBED AI Assistant</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:Inter,Arial,sans-serif"><div id="mp-ai-chatbot">MIGSO-PCUBED AI Assistant embed ready</div><script>window.parent.postMessage({type:'mp-ai-chatbot:ready'},'*')</script></body></html>`;
  });

  app.post("/embed/token", async (request, reply) => {
    if (!isAllowedEmbedOrigin(request, repo)) return reply.code(403).send({ error: "Embed origin not allowed" });
    const body = request.body as { subject?: string };
    return { token: signToken(body.subject ?? "embed-user", "embed", 15 * 60), expiresIn: 900 };
  });

  return app;
}

// Routes that a PENDING_MANAGER user is still allowed to call (read-only,
// session bootstrap + waiting-room workflow).
const PENDING_MANAGER_ALLOWED = new Set<string>([
  "/auth/me",
  "/auth/logout",
  "/auth/refresh",
  "/managers/active",
  "/notifications/pending-count"
]);

function auth(repo: AppRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const header = request.headers.authorization;
      const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
      const payload = verifyToken(token, "access");
      const actor = repo.findUserById(payload.sub);
      if (!actor || actor.status === "DISABLED") throw new Error("Invalid user");
      if (actor.status === "PENDING_MANAGER" && !PENDING_MANAGER_ALLOWED.has(request.routeOptions?.url ?? request.url)) {
        return reply.code(403).send({ error: "Account pending manager approval" });
      }
      request.actor = actor;
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };
}

function optionalAuth(repo: AppRepository) {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    try {
      const payload = verifyToken(header.slice(7), "access");
      request.actor = repo.findUserById(payload.sub);
    } catch {
      request.actor = undefined;
    }
  };
}

function toHistoryRow(repo: AppRepository, responseId: string) {
  const response = repo.state.responses.find((item) => item.id === responseId);
  if (!response) return null;
  const question = repo.state.messages.find((message) => message.id === response.messageId);
  const conversation = question ? repo.state.conversations.find((item) => item.id === question.conversationId) : undefined;
  const user = conversation ? repo.findUserById(conversation.userId) : undefined;
  const usage = repo.state.usages.find((item) => item.responseId === response.id);
  const sourceEvents = repo.state.retrievalEvents.filter((event) => event.responseId === response.id);
  const sources = sourceEvents
    .map((event) => {
      const chunk = repo.state.chunks.find((item) => item.id === event.chunkId);
      return chunk ? { ...event, chunk } : null;
    })
    .filter(Boolean);
  return {
    responseId: response.id,
    conversationId: conversation?.id,
    userId: user?.id,
    userName: user?.name,
    managerId: conversation?.managerId,
    question: question?.content,
    answer: response.content,
    language: question?.language,
    model: response.model,
    provider: response.provider,
    confidence: response.confidence,
    fallbackUsed: response.fallbackUsed,
    escalationTriggered: response.escalationTriggered,
    latencyMs: response.latencyMs,
    usage,
    sources,
    feedback: repo.state.feedback.filter((item) => item.responseId === response.id),
    adminComments: repo.state.adminComments.filter((item) => item.responseId === response.id),
    createdAt: response.createdAt
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[index] ?? 0;
}

function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function isAllowedEmbedOrigin(request: FastifyRequest, repo: AppRepository): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  return repo.state.settings.allowedEmbedOrigins.includes(origin);
}
