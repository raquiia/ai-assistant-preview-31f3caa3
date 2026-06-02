// Client API à double mode :
// - VITE_USE_MOCKS=true (par défaut ici) : sert des données fictives en mémoire
// - VITE_USE_MOCKS=false : tape la vraie API Fastify via VITE_API_URL (AWS)
//
// L'interface (get/post/patch + chemins) reste identique à apps/web/src/api.ts
// du repo mp-ai-assistant, donc le code des composants ne sait pas qu'il est mocké.

import { handleMock, buildAnswerForStream } from "./mocks";
import type { Session, ChatAnswerPayload } from "./types";
import type { SourceCitation } from "./shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? "true") !== "false";

/** Wave 6.D — événements SSE émis par /chat/.../messages/stream. */
export type StreamEvent =
  | { type: "start"; conversationId: string }
  | { type: "token"; delta: string }
  | { type: "sources"; sources: SourceCitation[] }
  | { type: "done"; payload: ChatAnswerPayload }
  | { type: "error"; message: string };

export interface StreamChatInput {
  conversationId: string;
  question: string;
  industryTags?: string[];
  pmDomainTags?: string[];
  signal?: AbortSignal;
}

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

  /**
   * Wave 6.D — Streaming chat (SSE).
   *
   * Mode mock : génère la réponse complète via mocks.buildAnswerForStream puis
   * la débite token par token (~10–25 ms) afin de simuler l'UX SSE.
   * Mode réel : POST /chat/conversations/:id/messages/stream et parse le flux
   * text/event-stream (event: token|sources|done|error).
   */
  async *streamChat(input: StreamChatInput): AsyncGenerator<StreamEvent, void, void> {
    const { conversationId, question, industryTags, pmDomainTags, signal } = input;

    if (USE_MOCKS) {
      yield { type: "start", conversationId };
      const payload = buildAnswerForStream(question, { industryTags, pmDomainTags });

      // Si cache HIT → on émet le texte d'un coup pour refléter la vitesse DynamoDB.
      if (payload.cache?.hit) {
        yield { type: "sources", sources: payload.sources };
        yield { type: "token", delta: payload.answer };
        yield { type: "done", payload };
        return;
      }

      // Sources d'abord (le rail latéral peut s'afficher pendant la génération).
      yield { type: "sources", sources: payload.sources };

      const words = payload.answer.split(/(\s+)/); // garde les espaces
      for (const word of words) {
        if (signal?.aborted) {
          yield { type: "error", message: "Génération interrompue" };
          return;
        }
        yield { type: "token", delta: word };
        // ~12 ms par token → ressenti fluide sans bloquer le rendu
        await new Promise((r) => setTimeout(r, 12));
      }
      yield { type: "done", payload };
      return;
    }

    // Mode réel — SSE
    const session = this.getSession();
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
    if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);

    const response = await fetch(
      `${API_URL}/chat/conversations/${conversationId}/messages/stream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ content: question, industryTags, pmDomainTags }),
        signal,
      },
    );
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by \n\n
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseSseFrame(frame);
        if (event) yield event;
      }
    }
  }
}

function parseSseFrame(frame: string): StreamEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    const data = JSON.parse(raw);
    switch (eventName) {
      case "start":
        return { type: "start", conversationId: data.conversationId };
      case "token":
        return { type: "token", delta: data.delta ?? "" };
      case "sources":
        return { type: "sources", sources: data.sources ?? [] };
      case "done":
        return { type: "done", payload: data as ChatAnswerPayload };
      case "error":
        return { type: "error", message: data.message ?? "Stream error" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export { API_URL, USE_MOCKS };
