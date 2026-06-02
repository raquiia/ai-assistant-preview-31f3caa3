import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

async function login(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const loginResponse = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password: "password123" }
  });
  const body = loginResponse.json() as { accessToken: string };
  return body.accessToken;
}

async function prepareConsultant(app: Awaited<ReturnType<typeof buildApp>>) {
  const token = await login(app, "consultant1@migso-pcubed.local");
  await app.inject({
    method: "POST",
    url: "/auth/first-visit/manager",
    headers: { authorization: `Bearer ${token}` },
    payload: { managerId: "usr-manager-a" }
  });
  const conversation = await app.inject({
    method: "POST",
    url: "/chat/conversations",
    headers: { authorization: `Bearer ${token}` },
    payload: { title: "Validation chat", language: "fr" }
  });
  const body = conversation.json() as { conversation: { id: string } };
  return { token, conversationId: body.conversation.id };
}

describe("API RBAC and chat contracts", () => {
  it("prevents a manager from seeing an unrelated consultant conversation", async () => {
    const app = await buildApp();
    const superAdmin = await login(app, "superadmin@migso-pcubed.local");
    const createdManager = await app.inject({
      method: "POST",
      url: "/superadmin/users",
      headers: { authorization: `Bearer ${superAdmin}` },
      payload: { email: "manager.b@migso-pcubed.local", name: "Claire Dubois", role: "MANAGER", language: "fr", status: "ACTIVE" }
    });
    const managerBody = createdManager.json() as { user: { id: string } };
    const token = await login(app, "manager.b@migso-pcubed.local");
    expect(managerBody.user.id).toBeTruthy();
    const consultant = await prepareConsultant(app);
    const response = await app.inject({
      method: "GET",
      url: `/chat/conversations/${consultant.conversationId}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns sources for a grounded KB question", async () => {
    const app = await buildApp();
    const superAdmin = await login(app, "superadmin@migso-pcubed.local");
    await app.inject({
      method: "POST",
      url: "/admin/kb/upload",
      headers: { authorization: `Bearer ${superAdmin}` },
      payload: {
        title: "PMO governance note.md",
        mimeType: "text/markdown",
        text: "Budget, forecast, reste a faire, risques et actions de mitigation doivent etre alignes dans la revue mensuelle."
      }
    });

    const consultant = await prepareConsultant(app);
    const response = await app.inject({
      method: "POST",
      url: `/chat/conversations/${consultant.conversationId}/messages`,
      headers: { authorization: `Bearer ${consultant.token}` },
      payload: { content: "Comment aligner budget, forecast et risques en revue mensuelle ?" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { sources: unknown[]; response: { escalationTriggered: boolean } };
    expect(body.sources.length).toBeGreaterThan(0);
    expect(body.response.escalationTriggered).toBe(false);
  });

  it("escalates when no reliable source exists", async () => {
    const app = await buildApp();
    const consultant = await prepareConsultant(app);
    const response = await app.inject({
      method: "POST",
      url: `/chat/conversations/${consultant.conversationId}/messages`,
      headers: { authorization: `Bearer ${consultant.token}` },
      payload: { content: "Quelle recette de dessert dois-je cuisiner ce soir ?" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { response: { escalationTriggered: boolean } };
    expect(body.response.escalationTriggered).toBe(true);
  });

  it("creates retry option for negative feedback", async () => {
    const app = await buildApp();
    const consultant = await prepareConsultant(app);
    const answer = await app.inject({
      method: "POST",
      url: `/chat/conversations/${consultant.conversationId}/messages`,
      headers: { authorization: `Bearer ${consultant.token}` },
      payload: { content: "Comment suivre un risque planning ?" }
    });
    const body = answer.json() as { response: { id: string } };
    const feedback = await app.inject({
      method: "POST",
      url: `/chat/responses/${body.response.id}/feedback`,
      headers: { authorization: `Bearer ${consultant.token}` },
      payload: { rating: "DOWN" }
    });
    expect(feedback.json()).toMatchObject({ retryAvailable: true });
  });

  it("activates approved admin comments as knowledge corrections", async () => {
    const app = await buildApp();
    const consultant = await prepareConsultant(app);
    const manager = await login(app, "manager.a@migso-pcubed.local");
    const answer = await app.inject({
      method: "POST",
      url: `/chat/conversations/${consultant.conversationId}/messages`,
      headers: { authorization: `Bearer ${consultant.token}` },
      payload: { content: "Comment documenter un retard fournisseur ?" }
    });
    const body = answer.json() as { response: { id: string } };
    const comment = await app.inject({
      method: "POST",
      url: `/admin/history/${body.response.id}/comment`,
      headers: { authorization: `Bearer ${manager}` },
      payload: { status: "APPROVED", comment: "Correction validee: toujours relier le retard au jalon client et au chemin critique." }
    });
    expect(comment.statusCode).toBe(200);
    expect(comment.body).toContain("ACTIVE");
  });

  it("never returns raw API keys after save", async () => {
    const app = await buildApp();
    const token = await login(app, "superadmin@migso-pcubed.local");
    const response = await app.inject({
      method: "POST",
      url: "/superadmin/ai-providers",
      headers: { authorization: `Bearer ${token}` },
      payload: { provider: "openai", model: "gpt-5.5", apiKey: "sk-secret-value-123456" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("sk-secret-value-123456");
    expect(response.body).toContain("sk-s");
  });

  it("rejects unauthorized embed origins", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/embed/chat",
      headers: { origin: "https://evil.example" }
    });
    expect(response.statusCode).toBe(403);
  });

  it("supports prompt rollback", async () => {
    const app = await buildApp();
    const token = await login(app, "superadmin@migso-pcubed.local");
    const created = await app.inject({
      method: "POST",
      url: "/superadmin/prompts",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Test prompt", content: "Prompt test", active: true }
    });
    const prompt = created.json() as { prompt: { id: string } };
    const rollback = await app.inject({
      method: "POST",
      url: "/superadmin/prompts/prompt-default-v1/rollback",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(prompt.prompt.id).toBeTruthy();
    expect(rollback.statusCode).toBe(200);
    expect(rollback.body).toContain("\"active\":true");
  });

  it("uploads text knowledge into documents and chunks", async () => {
    const app = await buildApp();
    const token = await login(app, "manager.a@migso-pcubed.local");
    const upload = await app.inject({
      method: "POST",
      url: "/admin/kb/upload",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "Test upload.txt", mimeType: "text/plain", text: "Planning governance requires owner, action, date and status." }
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.body).toContain("document");
    expect(upload.body).toContain("chunks");
    expect(upload.body).toContain("NEEDS_REVIEW");
  });
});
