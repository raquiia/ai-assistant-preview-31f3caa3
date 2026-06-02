/**
 * JIT user provisioning between Cognito and the application DB.
 *
 * Called from `GET /me` (right after token verification).
 *
 *  - First login of a Cognito user without a DB row → create the row,
 *    set `status = PENDING_MANAGER` for consultants (so the UI redirects
 *    to FirstVisitManagerSelection), `ACTIVE` for everyone else.
 *  - Subsequent logins where the Cognito group changed → sync `user.role`.
 *
 * All mutations emit an audit event.
 */
import type { CognitoClaims, AppRole } from "../providers/aws/cognito-auth.js";

export interface JitUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  status: "ACTIVE" | "PENDING_MANAGER" | "DISABLED";
  managerId: string | null;
  department: string | null;
  language: string;
}

export interface JitRepo {
  findById(id: string): Promise<JitUser | null>;
  create(input: JitUser): Promise<JitUser>;
  update(id: string, patch: Partial<JitUser>): Promise<JitUser>;
}

export interface JitAudit {
  (event: { action: string; actorId: string; entityType: "User"; entityId: string; metadataJson: Record<string, unknown> }): void;
}

export async function jitProvisionUser(
  claims: CognitoClaims,
  deps: { repo: JitRepo; audit: JitAudit }
): Promise<JitUser> {
  const id = claims.sub;
  const groups = (claims["cognito:groups"] as string[] | undefined) ?? [];
  const hasAnyGroup = groups.length > 0;

  let user = await deps.repo.findById(id);

  if (!user) {
    // Empêcher la création JIT sans email vérifié — sécurité critique :
    // sinon un attaquant qui contrôle un mail non vérifié pourrait
    // s'auto-provisionner avec un rôle CONSULTANT.
    if (claims["email_verified"] === false) {
      throw new Error("email_not_verified");
    }
    user = await deps.repo.create({
      id,
      email: claims.email ?? `${id}@unknown.local`,
      name: claims["cognito:username"] ?? claims.email ?? id,
      role: claims.role,
      status: hasAnyGroup
        ? claims.role === "CONSULTANT"
          ? "PENDING_MANAGER"
          : "ACTIVE"
        : "DISABLED",
      managerId: null,
      department: null,
      language: "fr",
    });
    deps.audit({
      action: "user.jit_provisioned",
      actorId: id,
      entityType: "User",
      entityId: id,
      metadataJson: { role: claims.role, source: "cognito", groups },
    });
    return user;
  }

  // Révocation : utilisateur retiré de tous les groupes Cognito → DISABLED.
  if (!hasAnyGroup && user.status !== "DISABLED") {
    user = await deps.repo.update(id, { status: "DISABLED" });
    deps.audit({
      action: "user.disabled_by_group_removal",
      actorId: id,
      entityType: "User",
      entityId: id,
      metadataJson: { previousRole: user.role, source: "cognito" },
    });
    return user;
  }

  if (user.role !== claims.role) {
    const previous = user.role;
    user = await deps.repo.update(id, { role: claims.role });
    deps.audit({
      action: rolePriorityRank(claims.role) < rolePriorityRank(previous)
        ? "user.role_demoted"
        : "user.role_synced",
      actorId: id,
      entityType: "User",
      entityId: id,
      metadataJson: { previous, next: claims.role, source: "cognito" },
    });
  }

  return user;
}

// Plus le nombre est élevé, plus le rôle est puissant.
function rolePriorityRank(role: AppRole): number {
  switch (role) {
    case "SUPER_ADMIN":
      return 4;
    case "MANAGER":
      return 3;
    case "AUDITOR":
      return 2;
    case "CONSULTANT":
    default:
      return 1;
  }
}
