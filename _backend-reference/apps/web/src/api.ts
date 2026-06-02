import type { Session } from "./types.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiClient {
  constructor(private readonly getSession: () => Session | null) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const session = this.getSession();
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
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
      body: payload instanceof FormData ? payload : JSON.stringify(payload ?? {})
    });
  }

  patch<T>(path: string, payload?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(payload ?? {})
    });
  }
}

export { API_URL };
