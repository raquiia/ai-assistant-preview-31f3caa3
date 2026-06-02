import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@mp/config";

interface TokenPayload {
  sub: string;
  type: "access" | "refresh" | "embed";
  exp: number;
}

export function signToken(sub: string, type: TokenPayload["type"], ttlSeconds: number): string {
  const payload: TokenPayload = {
    sub,
    type,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", env.jwtSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token: string, expectedType: TokenPayload["type"]): TokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Invalid token");
  const expectedSignature = createHmac("sha256", env.jwtSecret).update(body).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("Invalid token signature");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  if (payload.type !== expectedType) throw new Error("Invalid token type");
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}
