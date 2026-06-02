import "./globalPolyfill";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { ApiClient } from "../api";
import type { Role, User } from "../shared";
import type { Session } from "../types";
import type { AuthProvider } from "./providers";

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

const ROLE_PRIORITY: Role[] = ["SUPER_ADMIN", "MANAGER", "AUDITOR", "CONSULTANT"];

/**
 * Cognito auth provider for production AWS deployments.
 *
 * Flow:
 * 1. authenticateUser() → Cognito returns id+access+refresh tokens.
 * 2. We use the id token as bearer; the API verifies it against the User Pool JWKS
 *    (see _backend-reference/apps/api/src/providers/aws/cognito-auth.ts).
 * 3. GET /me hydrates the application User profile (JIT-provisioned server-side).
 */
export class CognitoAuthProvider implements AuthProvider {
  private readonly pool: CognitoUserPool;

  constructor(private readonly cfg: CognitoConfig) {
    this.pool = new CognitoUserPool({
      UserPoolId: cfg.userPoolId,
      ClientId: cfg.clientId,
    });
  }

  signIn(email: string, password: string): Promise<Session> {
    const user = new CognitoUser({ Username: email, Pool: this.pool });
    const auth = new AuthenticationDetails({ Username: email, Password: password });

    return new Promise<Session>((resolve, reject) => {
      user.authenticateUser(auth, {
        onSuccess: (result: CognitoUserSession) => {
          this.buildSession(result).then(resolve).catch(reject);
        },
        onFailure: (err) => reject(new Error(err?.message ?? "Cognito authentication failed")),
        newPasswordRequired: () => {
          reject(
            new Error(
              "Nouveau mot de passe requis. Connectez-vous une première fois via la console AWS pour valider votre mot de passe permanent.",
            ),
          );
        },
      });
    });
  }

  async signOut(session: Session | null): Promise<void> {
    if (!session) return;
    const current = this.pool.getCurrentUser();
    if (current) {
      current.signOut();
    }
  }

  async refresh(session: Session): Promise<Session | null> {
    // Left as a follow-up: requires storing the CognitoRefreshToken instance.
    return session;
  }

  private async buildSession(result: CognitoUserSession): Promise<Session> {
    const idToken = result.getIdToken();
    const accessToken = idToken.getJwtToken();
    const refreshToken = result.getRefreshToken().getToken();
    const payload = idToken.decodePayload() as {
      sub: string;
      email?: string;
      name?: string;
      "cognito:groups"?: string[];
      "cognito:username"?: string;
    };

    const groups = payload["cognito:groups"] ?? [];
    const role: Role = ROLE_PRIORITY.find((r) => groups.includes(r)) ?? "CONSULTANT";

    // Try to hydrate from /me (JIT provisioning on the API side).
    let user: User;
    try {
      const api = new ApiClient(() => ({ user: {} as User, accessToken }));
      const me = await api.get<{ user: User }>("/me");
      user = me.user;
    } catch {
      // Fallback: build a minimal user from claims so the UI can render.
      const now = new Date().toISOString();
      user = {
        id: payload.sub,
        email: payload.email ?? payload["cognito:username"] ?? "",
        name: payload.name ?? payload.email ?? "Utilisateur",
        role,
        language: "fr",
        status: "ACTIVE",
        managerId: null,
        department: null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return { user, accessToken, refreshToken };
  }
}
