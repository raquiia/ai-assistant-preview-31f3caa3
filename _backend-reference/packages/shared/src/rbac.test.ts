import { describe, expect, it } from "vitest";
import { canViewConversation, createDemoState, visibleConversationsFor } from "./index.js";

describe("RBAC conversation visibility", () => {
  const state = createDemoState();
  const managerA = state.users.find((user) => user.id === "usr-manager-a")!;
  const superAdmin = state.users.find((user) => user.role === "SUPER_ADMIN")!;
  const auditor = state.users.find((user) => user.role === "AUDITOR")!;
  const consultant = state.users.find((user) => user.id === "usr-consultant-1")!;
  const attachedConversation = {
    id: "conv-test-1",
    userId: consultant.id,
    managerId: managerA.id,
    title: "Test conversation",
    language: "fr",
    channel: "WEB",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const unrelatedManager = {
    id: "usr-manager-b",
    email: "manager.b@migso-pcubed.local",
    name: "Remote Manager",
    role: "MANAGER" as const,
    managerId: null,
    language: "fr",
    status: "ACTIVE" as const,
    department: "Other",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it("allows the attached manager to see a consultant conversation", () => {
    expect(canViewConversation(managerA, attachedConversation)).toBe(true);
  });

  it("blocks an unrelated manager", () => {
    expect(canViewConversation(unrelatedManager, attachedConversation)).toBe(false);
  });

  it("allows superadmin visibility and keeps auditor read-only", () => {
    expect(canViewConversation(superAdmin, attachedConversation)).toBe(true);
    expect(canViewConversation(auditor, attachedConversation)).toBe(false);
    expect(visibleConversationsFor(superAdmin, [attachedConversation])).toHaveLength(1);
    expect(visibleConversationsFor(auditor, [attachedConversation])).toHaveLength(0);
  });
});
