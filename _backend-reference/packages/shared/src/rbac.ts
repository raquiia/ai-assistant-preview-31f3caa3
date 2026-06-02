import type { Conversation, Role, User } from "./types.js";

export const roleRank: Record<Role, number> = {
  CONSULTANT: 1,
  MANAGER: 2,
  AUDITOR: 2,
  SUPER_ADMIN: 4
};

export function canManageUsers(actor: User): boolean {
  return actor.role === "SUPER_ADMIN";
}

export function canViewAudit(actor: User): boolean {
  return actor.role === "SUPER_ADMIN" || actor.role === "AUDITOR";
}

export function canEditPrompts(actor: User): boolean {
  return actor.role === "SUPER_ADMIN";
}

export function canUploadKnowledge(actor: User): boolean {
  // Verrou volontaire : seul le Super Admin alimente la base vectorielle.
  // Les MANAGER conservent un accès lecture seule via canReadKnowledge.
  return actor.role === "SUPER_ADMIN";
}

/** Alias sémantique : publish / reindex / archive / upload — toutes les
 *  écritures sur la base de connaissance. */
export const canManageKnowledge = canUploadKnowledge;

/** Lecture seule sur la KB : SUPER_ADMIN (édite), MANAGER (consulte les
 *  documents auxquels ses consultants accèdent), AUDITOR (revue de conformité). */
export function canReadKnowledge(actor: User): boolean {
  return (
    actor.role === "SUPER_ADMIN" ||
    actor.role === "MANAGER" ||
    actor.role === "AUDITOR"
  );
}

export function canViewConversation(actor: User, conversation: Conversation): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "AUDITOR") return false;
  if (actor.role === "CONSULTANT") return conversation.userId === actor.id;
  return conversation.managerId === actor.id;
}

export function canViewResponse(actor: User, conversation: Conversation): boolean {
  return canViewConversation(actor, conversation) || canViewAudit(actor);
}

export function canWriteConversation(actor: User, conversation: Conversation): boolean {
  if (actor.role !== "CONSULTANT") return false;
  return actor.status === "ACTIVE" && conversation.userId === actor.id;
}

export function assertRole(actor: User, roles: Role[]): void {
  if (!roles.includes(actor.role)) {
    const needed = roles.join(", ");
    throw new Error(`Access denied: requires ${needed}`);
  }
}

export function visibleConversationsFor(actor: User, conversations: Conversation[]): Conversation[] {
  return conversations.filter((conversation) => canViewConversation(actor, conversation));
}
