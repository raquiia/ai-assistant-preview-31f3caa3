import { ApiClient } from "../api";
import type { Session } from "../types";
import type { AuthProvider } from "./providers";

/**
 * Local auth: POST /auth/login against the Fastify backend (or mock).
 * Existing behaviour, preserved for development.
 */
export class LocalAuthProvider implements AuthProvider {
  async signIn(email: string, password: string): Promise<Session> {
    const api = new ApiClient(() => null);
    return api.post<Session>("/auth/login", { email, password });
  }

  async signOut(): Promise<void> {
    // No server-side revocation needed for stateless local JWT.
  }
}
