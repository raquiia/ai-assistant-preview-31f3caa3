// Wave 6.F — Observabilité front (Sentry + traceId).
//
// Activation conditionnelle : si VITE_SENTRY_DSN n'est pas défini (mode preview
// Lovable / dev local sans Sentry), on no-op proprement.
//
// Le traceId est généré côté client (format compatible W3C trace-context, 16 octets)
// et envoyé sur chaque appel API via le header `X-Trace-Id`. Le backend Fastify
// (cf. _backend-reference/apps/api/src/plugins/traceId.ts) le reprend ou en
// génère un, le journalise dans pino + l'attache aux spans Sentry/OTel.

import * as Sentry from "@sentry/react";

let initialized = false;

export function initObservability() {
  if (initialized) return;
  initialized = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // pas de DSN → no-op (preview, dev local)
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_ENV ?? "development",
    release: import.meta.env.VITE_RELEASE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  });
}

/** Génère un trace-id 16 octets hex (compatible W3C trace-context). */
export function newTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifie l'utilisateur courant côté Sentry (à appeler post-login/logout). */
export function setObservabilityUser(user: { id: string; email?: string; role?: string } | null) {
  if (!initialized || !import.meta.env.VITE_SENTRY_DSN) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id, email: user.email, segment: user.role });
}

/** Capture une erreur API avec son traceId pour corrélation backend. */
export function captureApiError(error: unknown, ctx: { path: string; method: string; traceId: string }) {
  if (!initialized || !import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.captureException(error, {
    tags: { traceId: ctx.traceId, method: ctx.method },
    contexts: { request: { path: ctx.path, method: ctx.method, trace_id: ctx.traceId } },
  });
}
