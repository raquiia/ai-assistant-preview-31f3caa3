import { createDemoState, defaultSystemPrompt, type AiProviderConfig, type AuditEvent, type DemoState, type PromptVersion, type User } from "@mp/shared";
import { HybridRetriever, MockVectorProvider } from "@mp/rag";

export class AppRepository {
  readonly state: DemoState = createDemoState();
  readonly vectorProvider = new MockVectorProvider();
  readonly retriever = new HybridRetriever(() => this.state.chunks, this.vectorProvider);

  async ready(): Promise<void> {
    await this.retriever.indexAll();
  }

  findUserByEmail(email: string): User | undefined {
    return this.state.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.state.users.find((user) => user.id === id);
  }

  activePrompt(): PromptVersion {
    const active = this.state.prompts.find((prompt) => prompt.active);
    if (active) return active;
    const first = this.state.prompts[0];
    if (first) return first;
    return {
      id: "prompt-local-fallback",
      name: "Local fallback prompt",
      content: defaultSystemPrompt,
      configJson: {
        tone: "professional",
        sourcePolicy: "use_internal_kb_first",
        webSearchEnabled: false
      },
      createdById: this.state.users.find((user) => user.role === "SUPER_ADMIN")?.id ?? "usr-superadmin",
      active: true,
      createdAt: new Date().toISOString()
    };
  }

  audit(event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    const record: AuditEvent = {
      ...event,
      id: `audit-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString()
    };
    this.state.auditEvents.unshift(record);
    return record;
  }

  maskedProviderConfigs(): AiProviderConfig[] {
    return this.state.providerConfigs.map((config) => ({
      ...config,
      encryptedApiKeyRef: config.encryptedApiKeyRef ? "stored" : null
    }));
  }
}
