import {
  Database,
  History,
  MessageSquareText,
  Plus,
  SendHorizontal,
  SlidersHorizontal,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Conversation, Message, SourceCitation } from "../shared";
import type { ApiClient } from "../api";
import type { ChatAnswerPayload, ConversationDetail, Session } from "../types";
import { EmptyState } from "./EmptyState";
import { FeedbackButtons } from "./FeedbackButtons";
import { MessageBubble } from "./MessageBubble";
import { SourceCards } from "./SourceCards";
import { SourceViewer } from "./SourceViewer";
import { UploadPanel } from "./UploadPanel";
import { VoiceInput } from "./VoiceInput";

type MobilePanel = "chat" | "conversations" | "sources" | "feedback";

export function ChatShell({ api, session }: { api: ApiClient; session: Session }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [lastAnswer, setLastAnswer] = useState<ChatAnswerPayload | null>(null);
  const [sourceViewer, setSourceViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");

  useEffect(() => {
    void refreshConversations();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadConversation(activeId);
  }, [activeId]);

  async function refreshConversations() {
    const payload = await api.get<{ conversations: Conversation[] }>("/chat/conversations");
    setConversations(payload.conversations);
    setActiveId((current) => {
      if (current && payload.conversations.some((conversation) => conversation.id === current)) return current;
      return payload.conversations[0]?.id ?? null;
    });
  }

  async function loadConversation(conversationId: string) {
    const payload = await api.get<ConversationDetail>(`/chat/conversations/${conversationId}`);
    setMessages(payload.messages);
    setLastAnswer(null);
  }

  async function newConversation() {
    const language = navigator.language?.slice(0, 2) || session.user.language || "fr";
    const payload = await api.post<{ conversation: Conversation }>("/chat/conversations", { title: "Nouvelle conversation", language });
    setConversations((items) => [payload.conversation, ...items]);
    setActiveId(payload.conversation.id);
    setMessages([]);
    setLastAnswer(null);
    setMobilePanel("chat");
  }

  async function send() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const language = navigator.language?.slice(0, 2) || session.user.language || "fr";
        const payload = await api.post<{ conversation: Conversation }>("/chat/conversations", {
          title: trimmed.slice(0, 64),
          language
        });
        conversationId = payload.conversation.id;
        setActiveId(conversationId);
        setConversations((items) => [payload.conversation, ...items]);
      }
      setQuestion("");
      const answer = await api.post<ChatAnswerPayload>(`/chat/conversations/${conversationId}/messages`, { content: trimmed });
      await loadConversation(conversationId);
      setLastAnswer(answer);
      await refreshConversations();
      setMobilePanel("chat");
    } finally {
      setLoading(false);
    }
  }

  async function retryFallback() {
    if (!lastAnswer) return;
    const answer = await api.post<ChatAnswerPayload>(`/chat/responses/${lastAnswer.response.id}/retry-fallback`);
    if (activeId) {
      await loadConversation(activeId);
      await refreshConversations();
    }
    setLastAnswer(answer);
    setMobilePanel("chat");
  }

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [activeId, conversations]);
  const shownSources: SourceCitation[] = lastAnswer?.sources ?? [];
  const canUploadKnowledge = session.user.role === "MANAGER" || session.user.role === "SUPER_ADMIN";

  return (
    <div className="grid h-[calc(100vh-4rem)] min-h-0 grid-cols-1 overflow-hidden bg-[#eef4f9] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside className="hidden min-h-0 flex-col border-r border-slate-200 bg-white xl:flex">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">Conversations</p>
            <p className="text-xs text-slate-500">Historique des echanges reels</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-mp bg-mp-blue text-white shadow-sm" title="Nouvelle conversation" onClick={newConversation}>
            <Plus size={16} />
          </button>
        </div>
        <div className="mp-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {conversations.length ? (
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const selected = conversation.id === activeId;
                return (
                  <button
                    key={conversation.id}
                    className={`w-full rounded-mp border p-3 text-left transition ${
                      selected ? "border-mp-blue bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                    onClick={() => setActiveId(conversation.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-mp ${selected ? "bg-mp-blue text-white" : "bg-slate-100 text-slate-500"}`}>
                        <MessageSquareText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-950">{conversation.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {conversation.channel} · {conversation.language}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Aucune conversation"
              description="La liste s'affichera ici une fois les premiers echanges reels crees."
              icon={<History size={18} />}
              actions={<button className="h-9 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white" onClick={newConversation}>Demarrer</button>}
            />
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-slate-50">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{activeConversation?.title ?? "Assistant MIGSO-PCUBED"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Langue {session.user.language}</span>
                {activeConversation && <span className="rounded-full bg-slate-100 px-2.5 py-1">{activeConversation.channel}</span>}
                {!canUploadKnowledge && <span className="rounded-full bg-slate-100 px-2.5 py-1">Consultant</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canUploadKnowledge && (
                <div className="hidden md:block">
                  <UploadPanel api={api} />
                </div>
              )}
              <button className="grid h-10 w-10 place-items-center rounded-mp border border-slate-200 bg-white text-slate-600 xl:hidden" title="Conversation" onClick={() => setMobilePanel("conversations")}>
                <Users size={17} />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-slate-200 bg-white px-3 py-2 xl:hidden">
                <div className="grid grid-cols-4 gap-2">
                  <PanelButton icon={<MessageSquareText size={16} />} label="Chat" active={mobilePanel === "chat"} onClick={() => setMobilePanel("chat")} />
                  <PanelButton icon={<History size={16} />} label="Conversations" active={mobilePanel === "conversations"} onClick={() => setMobilePanel("conversations")} />
                  <PanelButton icon={<Database size={16} />} label="Sources" active={mobilePanel === "sources"} onClick={() => setMobilePanel("sources")} />
                  <PanelButton icon={<SlidersHorizontal size={16} />} label="Feedback" active={mobilePanel === "feedback"} onClick={() => setMobilePanel("feedback")} />
                </div>
              </div>

              <div className="mp-scrollbar min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
                {mobilePanel === "conversations" ? (
                  <div className="space-y-3 xl:hidden">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Conversations</p>
                        <p className="text-xs text-slate-500">Selection rapide sur petit ecran</p>
                      </div>
                      <button className="grid h-10 w-10 place-items-center rounded-mp bg-mp-blue text-white" title="Nouvelle conversation" onClick={newConversation}>
                        <Plus size={16} />
                      </button>
                    </div>
                    {conversations.length ? (
                      <div className="space-y-2">
                        {conversations.map((conversation) => (
                          <button
                            key={conversation.id}
                            className={`w-full rounded-mp border p-3 text-left text-sm ${
                              conversation.id === activeId ? "border-mp-blue bg-blue-50" : "border-slate-200 bg-white"
                            }`}
                            onClick={() => {
                              setActiveId(conversation.id);
                              setMobilePanel("chat");
                            }}
                          >
                            <p className="truncate font-medium text-slate-950">{conversation.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {conversation.channel} · {conversation.language}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title="Aucune conversation"
                        description="Commencez une nouvelle conversation ou posez une premiere question pour generer l'historique."
                        icon={<History size={18} />}
                        actions={<button className="h-9 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white" onClick={newConversation}>Demarrer</button>}
                      />
                    )}
                  </div>
                ) : mobilePanel === "sources" ? (
                  <div className="space-y-4 xl:hidden">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Sources</p>
                      <p className="text-xs text-slate-500">Extraits cites par pertinence estimee</p>
                    </div>
                    <SourceCards sources={shownSources} onOpen={setSourceViewer} />
                    {!shownSources.length && (
                      <EmptyState
                        title="Aucune source"
                        description="Uploadez une base de connaissance ou activez un provider de recherche pour afficher des sources."
                        icon={<Database size={18} />}
                      />
                    )}
                  </div>
                ) : mobilePanel === "feedback" ? (
                  <div className="space-y-4 xl:hidden">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Feedback</p>
                      <p className="text-xs text-slate-500">Note, escalade et retour sur comportement</p>
                    </div>
                    <div className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
                      <FeedbackButtons api={api} responseId={lastAnswer?.response.id} onRetry={retryFallback} />
                      {lastAnswer ? (
                        <div className="mt-4 space-y-2 text-sm text-slate-600">
                          <MetaRow label="Modele" value={lastAnswer.response.model} />
                          <MetaRow label="Confiance" value={`${lastAnswer.response.confidence}/100`} />
                          <MetaRow label="Fallback" value={lastAnswer.response.fallbackUsed ? "Oui" : "Non"} />
                          <MetaRow label="Escalade" value={lastAnswer.response.escalationTriggered ? "Oui" : "Non"} />
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">Les actions de feedback s'activent apres une premiere reponse.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <EmptyState
                        title="Commencez une conversation"
                        description="Posez une question PMO, planning, risque, cout, gouvernance ou knowledge management. Si aucune base n'est disponible, l'assistant vous le dira clairement."
                        icon={<MessageSquareText size={18} />}
                      />
                    ) : (
                      messages.map((message) => <MessageBubble key={message.id} message={message} />)
                    )}

                    {lastAnswer?.escalationMessage && (
                      <div className="rounded-mp border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                        {lastAnswer.escalationMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <footer className={`${mobilePanel === "chat" ? "block" : "hidden xl:block"} border-t border-slate-200 bg-white p-4 lg:p-5`}>
                <div className="flex items-end gap-2">
                  <textarea
                    className="min-h-12 flex-1 resize-none rounded-mp border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-mp-cyan"
                    rows={1}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Posez votre question..."
                  />
                  <VoiceInput onTranscript={(text) => setQuestion((current) => `${current}${current ? " " : ""}${text}`)} />
                  <button
                    className="grid h-11 w-11 place-items-center rounded-mp bg-mp-blue text-white shadow-sm disabled:cursor-wait disabled:opacity-60"
                    disabled={loading}
                    title="Envoyer"
                    onClick={() => void send()}
                  >
                    <SendHorizontal size={18} />
                  </button>
                </div>
              </footer>
            </div>

            <aside className="hidden min-h-0 flex-col border-l border-slate-200 bg-slate-50 xl:flex">
              <div className="border-b border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Sources et pilotage</p>
                <p className="mt-1 text-xs text-slate-500">Les panneaux restent visibles pour ne rien perdre quand la densite augmente.</p>
              </div>
              <div className="mp-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Sources</p>
                        <p className="text-xs text-slate-500">Pertinence estimee, pas verite absolue.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{shownSources.length}</span>
                    </div>
                    <SourceCards sources={shownSources} onOpen={setSourceViewer} />
                    {!shownSources.length && (
                      <div className="mt-3">
                        <EmptyState
                          title="Aucune source"
                          description="Aucune base de connaissance ou aucun provider de recherche n'est configure pour cette reponse."
                          icon={<Database size={18} />}
                        />
                      </div>
                    )}
                  </section>

                  <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Feedback</p>
                        <p className="text-xs text-slate-500">Gestion du retour utilisateur et retry fallback.</p>
                      </div>
                    </div>
                    <FeedbackButtons api={api} responseId={lastAnswer?.response.id} onRetry={retryFallback} />
                    {lastAnswer ? (
                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        <MetaRow label="Modele" value={lastAnswer.response.model} />
                        <MetaRow label="Confiance" value={`${lastAnswer.response.confidence}/100`} />
                        <MetaRow label="Fallback" value={lastAnswer.response.fallbackUsed ? "Oui" : "Non"} />
                        <MetaRow label="Escalade" value={lastAnswer.response.escalationTriggered ? "Oui" : "Non"} />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">Les controles de feedback apparaissent apres la premiere reponse.</p>
                    )}
                  </section>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {sourceViewer && <SourceViewer api={api} chunkId={sourceViewer} onClose={() => setSourceViewer(null)} />}
    </div>
  );
}

function PanelButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-10 items-center justify-center gap-2 rounded-mp border px-3 text-xs font-medium ${
        active ? "border-mp-blue bg-blue-50 text-mp-blue" : "border-slate-200 bg-white text-slate-600"
      }`}
      onClick={onClick}
      title={label}
    >
      <span className="grid h-5 w-5 place-items-center">{icon}</span>
      <span className="hidden truncate sm:inline">{label}</span>
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-900">{value}</span>
    </div>
  );
}
