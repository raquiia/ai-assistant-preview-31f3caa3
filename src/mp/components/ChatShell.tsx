import {
  ArrowUp,
  ChevronRight,
  Database,
  Loader2,
  MessageSquarePlus,
  PanelRightOpen,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ApiClient } from "../api";
import type { Conversation, Message, SourceCitation } from "../shared";
import type { ChatAnswerPayload, ConversationDetail, Session } from "../types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "./EmptyState";
import { FeedbackButtons } from "./FeedbackButtons";
import { MessageBubble } from "./MessageBubble";
import { SourceCards } from "./SourceCards";
import { SourceViewer } from "./SourceViewer";
import { VoiceInput } from "./VoiceInput";
import { ChatFiltersBar } from "./ChatFilters";
import { labelForIndustry, labelForPmDomain, type ChatFilters } from "../shared";
import { toast } from "sonner";

const FILTERS_STORAGE_KEY = "mp.chat.filters.v1";
function loadFilters(): ChatFilters {
  if (typeof window === "undefined") return { industryTags: [], pmDomainTags: [] };
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ChatFilters>;
      return {
        industryTags: Array.isArray(parsed.industryTags) ? parsed.industryTags : [],
        pmDomainTags: Array.isArray(parsed.pmDomainTags) ? parsed.pmDomainTags : [],
      };
    }
  } catch {}
  return { industryTags: [], pmDomainTags: [] };
}

const SUGGESTIONS = [
  { icon: Sparkles, label: "Construire un planning multi-projet", prompt: "Comment structurer un planning multi-projet avec dépendances inter-équipes ?" },
  { icon: Zap, label: "Identifier les risques majeurs", prompt: "Quels sont les 5 risques majeurs à anticiper en début de programme PMO ?" },
  { icon: Database, label: "Méthodologie de gouvernance", prompt: "Décris une gouvernance projet pour un programme transverse de 18 mois." },
];

export function ChatShell({ api, session }: { api: ApiClient; session: Session }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [lastAnswer, setLastAnswer] = useState<ChatAnswerPayload | null>(null);
  const [sourceViewer, setSourceViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Wave 6.D — texte assistant en cours de stream (tokens accumulés). */
  const [streamingText, setStreamingText] = useState("");
  /** Wave 6.D — sources reçues avant la fin du stream (rail latéral live). */
  const [streamingSources, setStreamingSources] = useState<SourceCitation[]>([]);
  const [showConversations, setShowConversations] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [filters, setFilters] = useState<ChatFilters>(() => loadFilters());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);

  useEffect(() => { void refreshConversations(); }, []);
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    void loadConversation(activeId);
  }, [activeId]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, lastAnswer, streamingText]);

  async function refreshConversations() {
    try {
      const payload = await api.get<{ conversations: Conversation[] }>("/chat/conversations");
      setConversations(payload.conversations);
      setActiveId((cur) => cur && payload.conversations.some((c) => c.id === cur) ? cur : payload.conversations[0]?.id ?? null);
    } catch (e) {
      toast.error("Impossible de charger les conversations");
    }
  }

  async function loadConversation(id: string) {
    try {
      const payload = await api.get<ConversationDetail>(`/chat/conversations/${id}`);
      setMessages(payload.messages);
      setLastAnswer(null);
    } catch (e) {
      toast.error("Conversation indisponible");
    }
  }

  async function newConversation() {
    const language = navigator.language?.slice(0, 2) || session.user.language || "fr";
    try {
      const payload = await api.post<{ conversation: Conversation }>("/chat/conversations", { title: "Nouvelle conversation", language });
      setConversations((items) => [payload.conversation, ...items]);
      setActiveId(payload.conversation.id);
      setMessages([]); setLastAnswer(null); setShowConversations(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (e) {
      toast.error("Impossible de créer une conversation");
    }
  }

  async function send(textOverride?: string) {
    const trimmed = (textOverride ?? question).trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setStreamingText("");
    setStreamingSources([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const language = navigator.language?.slice(0, 2) || session.user.language || "fr";
        const payload = await api.post<{ conversation: Conversation }>("/chat/conversations", {
          title: trimmed.slice(0, 64),
          language,
        });
        conversationId = payload.conversation.id;
        setActiveId(conversationId);
        setConversations((items) => [payload.conversation, ...items]);
      }
      setQuestion("");
      // Optimistic user message
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        role: "user",
        content: trimmed,
        language: session.user.language,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      // Wave 6.D — stream SSE token par token.
      let finalPayload: ChatAnswerPayload | null = null;
      let acc = "";
      for await (const evt of api.streamChat({
        conversationId,
        question: trimmed,
        industryTags: filters.industryTags,
        pmDomainTags: filters.pmDomainTags,
        signal: controller.signal,
      })) {
        if (evt.type === "token") {
          acc += evt.delta;
          setStreamingText(acc);
        } else if (evt.type === "sources") {
          setStreamingSources(evt.sources);
        } else if (evt.type === "done") {
          finalPayload = evt.payload;
        } else if (evt.type === "error") {
          throw new Error(evt.message);
        }
      }

      if (finalPayload) {
        setLastAnswer(finalPayload);
        await loadConversation(conversationId);
        await refreshConversations();
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        toast.message("Génération interrompue");
      } else {
        toast.error("La réponse a échoué", { description: e instanceof Error ? e.message : undefined });
      }
    } finally {
      setStreamingText("");
      setStreamingSources([]);
      abortRef.current = null;
      setLoading(false);
    }
  }

  function stopStream() {
    abortRef.current?.abort();
  }

  async function retryFallback() {
    if (!lastAnswer) return;
    try {
      const answer = await api.post<ChatAnswerPayload>(`/chat/responses/${lastAnswer.response.id}/retry-fallback`);
      if (activeId) { await loadConversation(activeId); await refreshConversations(); }
      setLastAnswer(answer);
    } catch (e) {
      toast.error("Re-génération impossible");
    }
  }

  const activeConv = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [activeId, conversations]);
  const shownSources: SourceCitation[] =
    lastAnswer?.sources ?? (streamingSources.length ? streamingSources : []);
  const hasSources = shownSources.length > 0;

  return (
    <>
      <div className="flex h-full min-h-0 flex-1">
        {/* Conversations rail — desktop */}
        <aside className="hidden h-full w-72 shrink-0 flex-col border-r bg-card/40 lg:flex">
          <ConversationsList
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => setActiveId(id)}
            onNew={newConversation}
          />
        </aside>

        {/* Main chat column */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Mobile chips */}
          <div className="flex items-center gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur lg:hidden">
            <Button variant="outline" size="sm" onClick={() => setShowConversations(true)} className="h-8">
              <MessageSquarePlus className="mr-1.5 size-3.5" />
              Conversations
            </Button>
            {hasSources && (
              <Button variant="outline" size="sm" onClick={() => setShowSources(true)} className="h-8">
                <Database className="mr-1.5 size-3.5" /> Sources ({shownSources.length})
              </Button>
            )}
            <div className="ml-auto truncate text-xs text-muted-foreground">{activeConv?.title ?? "Nouvelle conversation"}</div>
          </div>

          {/* Messages */}
          <ScrollArea className="min-h-0 flex-1">
            <div ref={scrollRef} className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-6 lg:py-10">
              {messages.length === 0 ? (
                <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="mb-6 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-glow ring-1 ring-primary/30"
                  >
                    <Sparkles className="size-7" />
                  </motion.div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Bonjour {session.user.name.split(" ")[0]}</h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Posez une question PMO, planning, risque, gouvernance ou KM. L'assistant cite ses sources et explique son raisonnement.
                  </p>

                  <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
                    {SUGGESTIONS.map(({ icon: Icon, label, prompt }, i) => (
                      <motion.button
                        key={label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                        onClick={() => void send(prompt)}
                        className="group flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition hover:border-primary/30 hover:shadow-soft"
                      >
                        <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <p className="text-sm font-medium leading-snug">{label}</p>
                        <span className="mt-auto inline-flex items-center text-xs text-muted-foreground group-hover:text-primary">
                          Lancer <ChevronRight className="ml-0.5 size-3" />
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <AnimatePresence initial={false}>
                    {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
                  </AnimatePresence>

                  {loading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3 px-1">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                        <Sparkles className={`size-4 ${streamingText ? "" : "animate-pulse"}`} />
                      </div>
                      {streamingText ? (
                        // Wave 6.D — bulle assistant en cours de stream
                        <div className="flex-1 whitespace-pre-wrap rounded-2xl bg-muted/40 px-4 py-3 text-sm leading-relaxed">
                          {streamingText}
                          <span className="ml-0.5 inline-block h-4 w-[2px] -mb-0.5 animate-pulse bg-primary align-middle" />
                        </div>
                      ) : (
                        <div className="flex h-8 items-center gap-1 text-sm text-muted-foreground">
                          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                          <span className="ml-2 text-xs">Génération…</span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {lastAnswer?.escalationMessage && (
                    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-relaxed text-warning-foreground">
                      <p className="font-medium">Escalade déclenchée</p>
                      <p className="mt-1 text-foreground/80">{lastAnswer.escalationMessage}</p>
                    </div>
                  )}

                  {lastAnswer && (() => {
                    const conf = Math.max(0, Math.min(100, lastAnswer.response.confidence ?? 0));
                    const confTone = conf >= 80 ? "bg-success" : conf >= 60 ? "bg-warning" : "bg-destructive";
                    const confLabel = conf >= 80 ? "Élevée" : conf >= 60 ? "Modérée" : "Faible";
                    const isFallback = lastAnswer.response.fallbackUsed;
                    const providerLabel = isFallback ? "OpenAI · fallback" : "Mistral";
                    return (
                      <div className="space-y-3 rounded-xl border bg-card/60 p-3 backdrop-blur">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={isFallback ? "outline" : "secondary"}
                            className={`gap-1 ${isFallback ? "border-warning/40 bg-warning/10 text-warning" : ""}`}
                          >
                            <Sparkles className="size-3" /> {providerLabel}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-[10px]">{lastAnswer.response.model}</Badge>
                          <span className="text-xs text-muted-foreground">{lastAnswer.response.latencyMs}ms</span>
                          {lastAnswer.cache?.hit && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              title={`DynamoDB cache · clé ${lastAnswer.cache.key.slice(0, 8)}…`}
                            >
                              ⚡ Cache hit · {lastAnswer.cache.ageSeconds < 60
                                ? `${lastAnswer.cache.ageSeconds}s`
                                : `${Math.floor(lastAnswer.cache.ageSeconds / 60)}min`}
                            </Badge>
                          )}
                          {lastAnswer.response.escalationTriggered && (
                            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">escalade</Badge>
                          )}

                        </div>
                        {lastAnswer.appliedFilters &&
                          (lastAnswer.appliedFilters.industryTags.length > 0 ||
                            lastAnswer.appliedFilters.pmDomainTags.length > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="text-muted-foreground">Orientée:</span>
                              {lastAnswer.appliedFilters.industryTags.map((t) => (
                                <Badge key={`i-${t}`} variant="outline" className="border-primary/30 bg-primary/5 text-[10px]">
                                  {labelForIndustry(t)}
                                </Badge>
                              ))}
                              {lastAnswer.appliedFilters.pmDomainTags.map((t) => (
                                <Badge key={`d-${t}`} variant="outline" className="border-primary/30 bg-primary/5 text-[10px]">
                                  {labelForPmDomain(t)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Confiance · {confLabel}</span>
                            <span className="font-mono tabular-nums text-muted-foreground">{conf}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full transition-all ${confTone}`} style={{ width: `${conf}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <FeedbackButtons api={api} responseId={lastAnswer.response.id} onRetry={retryFallback} />
                          {!isFallback && (
                            <Button size="sm" variant="outline" onClick={() => void retryFallback()} className="h-7 gap-1.5 text-xs">
                              <Zap className="size-3" /> Régénérer avec OpenAI
                            </Button>
                          )}
                          {hasSources && (
                            <Button variant="outline" size="sm" onClick={() => setShowSources(true)} className="h-7 gap-1.5 text-xs lg:hidden">
                              <Database className="size-3" /> {shownSources.length} source{shownSources.length > 1 ? "s" : ""}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t bg-background/95 px-3 py-3 backdrop-blur-xl lg:px-6 lg:py-4">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-2 flex items-center justify-between gap-2">
                <ChatFiltersBar filters={filters} onChange={setFilters} />
                <span className="hidden text-[10px] text-muted-foreground sm:inline">
                  Orientez les sources par secteur et/ou domaine
                </span>
              </div>
              <div className="group relative flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-soft transition focus-within:border-primary/40 focus-within:shadow-glow">
                <textarea
                  ref={textareaRef}
                  className="mp-scrollbar max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                  rows={1}
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    const t = e.target;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                  }}
                  placeholder="Posez votre question…  (⏎ envoyer · ⇧⏎ saut de ligne)"
                  disabled={loading}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <VoiceInput onTranscript={(t) => setQuestion((c) => `${c}${c ? " " : ""}${t}`)} />
                  <Button
                    size="icon"
                    onClick={() => void send()}
                    disabled={!question.trim() && !loading}
                    className="size-9 rounded-xl"
                    aria-label={loading ? "Génération en cours" : "Envoyer"}
                  >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Les réponses peuvent contenir des erreurs. Vérifiez les sources avant action.
              </p>
            </div>
          </div>
        </div>

        {/* Sources rail — desktop */}
        {hasSources && (
          <aside className="hidden h-full w-80 shrink-0 flex-col border-l bg-card/40 xl:flex">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="font-display text-sm font-semibold">Sources</p>
                <p className="text-xs text-muted-foreground">{shownSources.length} citation{shownSources.length > 1 ? "s" : ""}</p>
              </div>
              <PanelRightOpen className="size-4 text-muted-foreground" />
            </div>
            <ScrollArea className="min-h-0 flex-1 p-3">
              <SourceCards sources={shownSources} onOpen={setSourceViewer} />
            </ScrollArea>
          </aside>
        )}
      </div>

      {/* Mobile conversations */}
      <Sheet open={showConversations} onOpenChange={setShowConversations}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="border-b px-4 py-3"><SheetTitle>Conversations</SheetTitle></SheetHeader>
          <ConversationsList
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setShowConversations(false); }}
            onNew={newConversation}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile sources */}
      <Sheet open={showSources} onOpenChange={setShowSources}>
        <SheetContent side="right" className="w-full p-0 sm:w-96">
          <SheetHeader className="border-b px-4 py-3"><SheetTitle>Sources</SheetTitle></SheetHeader>
          <ScrollArea className="h-[calc(100%-3.5rem)] p-4">
            {shownSources.length ? (
              <SourceCards sources={shownSources} onOpen={(c) => { setSourceViewer(c); setShowSources(false); }} />
            ) : (
              <EmptyState title="Aucune source" description="La base de connaissance n'a renvoyé aucun extrait au-dessus du seuil de pertinence (minRelevanceScore). Le Super Admin peut l'ajuster dans Prompts & modèles." icon={<Database className="size-5" />} />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Source viewer overlay */}
      {sourceViewer && <SourceViewer api={api} chunkId={sourceViewer} onClose={() => setSourceViewer(null)} />}
    </>
  );
}

function ConversationsList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="font-display text-sm font-semibold">Conversations</p>
        <Button size="sm" onClick={onNew} className="h-8 gap-1.5">
          <MessageSquarePlus className="size-3.5" /> Nouvelle
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {conversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">Pas encore de conversation</p>
              <Button size="sm" onClick={onNew} variant="link" className="mt-1 h-auto p-0 text-xs">Démarrer la première</Button>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelect(c.id)}
                      className={`group flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition ${
                        active ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
                      }`}
                    >
                      <p className={`truncate text-sm ${active ? "font-medium text-primary" : ""}`}>{c.title}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{c.channel}</span><span>·</span><span>{c.language.toUpperCase()}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
