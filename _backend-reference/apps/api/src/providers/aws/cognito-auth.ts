/**
 * Cognito JWT verifier — validates access tokens against the user pool JWKS
 * and maps `cognito:groups` to application roles.
 *
 * Usage in a Fastify/Express middleware:
 *   const claims = await cognitoAuth.verify(authorizationHeader);
 *   request.user = { id: claims.sub, email: claims.email, role: claims.role };
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AppRole = "CONSULTANT" | "MANAGER" | "SUPER_ADMIN" | "AUDITOR";

const APP_ROLE_PRIORITY: AppRole[] = ["SUPER_ADMIN", "MANAGER", "AUDITOR", "CONSULTANT"];

export interface CognitoAuthOptions {
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface CognitoClaims extends JWTPayload {
  sub: string;
  email?: string;
  "cognito:username"?: string;
  "cognito:groups"?: string[];
  token_use: "id" | "access";
  role: AppRole;
}

export class CognitoAuthProvider {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(private readonly opts: CognitoAuthOptions) {
    this.issuer = `https://cognito-idp.${opts.region}.amazonaws.com/${opts.userPoolId}`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(authorizationHeader: string | undefined): Promise<CognitoClaims> {
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new Error("Missing or malformed Authorization header");
    }
    const token = authorizationHeader.slice(7);
    const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });

    if (payload.token_use !== "access" && payload.token_use !== "id") {
      throw new Error(`Unexpected token_use ${String(payload.token_use)}`);
    }
    if (payload.token_use === "access" && payload.client_id !== this.opts.clientId) {
      throw new Error("Token client_id mismatch");
    }
    if (payload.token_use === "id" && payload.aud !== this.opts.clientId) {
      throw new Error("Token aud mismatch");
    }

    const groups = (payload["cognito:groups"] as string[] | undefined) ?? [];
    const role = APP_ROLE_PRIORITY.find((r) => groups.includes(r)) ?? "CONSULTANT";

    return { ...payload, role } as CognitoClaims;
  }
}
