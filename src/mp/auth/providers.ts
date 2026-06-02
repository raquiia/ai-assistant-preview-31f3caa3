import type { Session } from "../types";

export interface AuthProvider {
  /** Sign in with email/password, returns a Session with bearer token. */
  signIn(email: string, password: string): Promise<Session>;
  /** Sign out (revokes Cognito tokens; no-op in local mode). */
  signOut(session: Session | null): Promise<void>;
  /** Optional refresh — returns null if no refresh capability. */
  refresh?(session: Session): Promise<Session | null>;
}

export type AuthMode = "local" | "cognito";

export const AUTH_MODE: AuthMode =
  (import.meta.env.VITE_AUTH_MODE as AuthMode | undefined) === "cognito" ? "cognito" : "local";
