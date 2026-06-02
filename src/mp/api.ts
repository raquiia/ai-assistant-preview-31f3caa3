// Client API à double mode :
// - VITE_USE_MOCKS=true (par défaut ici) : sert des données fictives en mémoire
// - VITE_USE_MOCKS=false : tape la vraie API Fastify via VITE_API_URL (AWS)
//
// L'interface (get/post/patch + chemins) reste identique à apps/web/src/api.ts
// du repo mp-ai-assistant, donc le code des composants ne sait pas qu'il est mocké.

import { handleMock } from "./mocks";
import type { Session } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? "true") !== "false";

export class ApiClient {
  constructor(private readonly getSession: () => Session | null) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (USE_MOCKS) {
      const method = (init.method ?? "GET").toUpperCase();
      let body: unknown = undefined;
      if (init.body && !(init.body instanceof FormData)) {
        try {
          body = JSON.parse(init.body as string);
        } catch {
          body = init.body;
        }
      } else if (init.body instanceof FormData) {
        body = init.body;
      }
      const session = this.getSession();
      // simulate small latency for realism
      await new Promise((resolve) => setTimeout(resolve, 120));
      return handleMock<T>(method, path, body, session);
    }

    const session = this.getSession();
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return (await response.text()) as T;
    return response.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, payload?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: payload instanceof FormData ? payload : JSON.stringify(payload ?? {}),
    });
  }

  patch<T>(path: string, payload?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(payload ?? {}),
    });
  }
}

export { API_URL, USE_MOCKS };
