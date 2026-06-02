import {
  CheckCircle2,
  Languages,
  MessageSquareText,
  Save,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User2,
  X,
  AlertTriangle,
  Zap,
  Clock,
  Star,
  MessageCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../api";
import type { HistoryRow } from "../types";
import { AdminLayout } from "./AdminLayout";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConsultantFeedback {
  id: string;
  userId: string;
  userName: string;
  rating: string;
  comment?: string | null;
  createdAt: string;
}

interface AdminComment {
  id: string;
  adminId: string;
  adminName: string;
  comment: string;
  status: string;
  createdAt: string;
}

interface HistorySource {
  chunk: { title: string; section?: string; page?: number | null; text: string };
  score: number;
}

interface HistoryDetail extends HistoryRow {
  feedback: ConsultantFeedback[];
  adminComments: AdminComment[];
  sources: HistorySource[];
}

const POSITIVE_RATINGS = new Set(["UP", "FOUR", "FIVE"]);
const NEGATIVE_RATINGS = new Set(["DOWN", "ONE", "TWO"]);
const PAGE_SIZE = 12;

function ratingTone(rating: string): "positive" | "negative" | "neutral" {
  if (POSITIVE_RATINGS.has(rating)) return "positive";
  if (NEGATIVE_RATINGS.has(rating)) return "negative";
  return "neutral";
}

function ratingLabel(rating: string) {
  switch (rating) {
    case "UP":
      return "Pouce haut";
    case "DOWN":
      return "Pouce bas";
    case "ONE":
      return "1 / 5";
    case "TWO":
      return "2 / 5";
    case "THREE":
      return "3 / 5";
    case "FOUR":
      return "4 / 5";
    case "FIVE":
      return "5 / 5";
    default:
      return rating;
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString();
}

type RowFeedbackSummary = {
  tone: "positive" | "negative" | "neutral" | "none";
  icon: typeof ThumbsUp | null;
  label: string;
};

function summarizeRowFeedback(row: HistoryRow): RowFeedbackSummary {
  const rating = (row as HistoryRow & { feedbackRating?: string | null }).feedbackRating;
  if (!rating) return { tone: "none", icon: null, label: "Aucun retour" };
  const tone = ratingTone(rating);
  if (tone === "positive") return { tone, icon: ThumbsUp, label: ratingLabel(rating) };
  if (tone === "negative") return { tone, icon: ThumbsDown, label: ratingLabel(rating) };
  return { tone: "neutral", icon: Star, label: ratingLabel(rating) };
}

export function ManagerAdminHistory({ api }: { api: ApiClient }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<HistoryDetail | null>(null);
  const [comment, setComment] = useState("");
  const [translation, setTranslation] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | "positive" | "negative" | "neutral" | "none">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "escalation" | "fallback" | "normal">("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api
      .get<{ rows?: HistoryRow[] }>("/admin/history")
      .then((payload) => setRows(payload?.rows ?? []))
      .catch(() => setRows([]));
  }, [api]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const now = Date.now();
    const periodMs =
      periodFilter === "24h" ? 24 * 3600_000 :
      periodFilter === "7d" ? 7 * 24 * 3600_000 :
      periodFilter === "30d" ? 30 * 24 * 3600_000 : null;

    return rows.filter((row) => {
      if (lower) {
        const haystack = `${row.userName} ${row.question} ${row.answer}`.toLowerCase();
        if (!haystack.includes(lower)) return false;
      }
      if (statusFilter === "escalation" && !row.escalationTriggered) return false;
      if (statusFilter === "fallback" && !row.fallbackUsed) return false;
      if (statusFilter === "normal" && (row.fallbackUsed || row.escalationTriggered)) return false;

      if (feedbackFilter !== "all") {
        const summary = summarizeRowFeedback(row);
        if (feedbackFilter === "none" && summary.tone !== "none") return false;
        if (feedbackFilter !== "none" && summary.tone !== feedbackFilter) return false;
      }

      if (periodMs && now - new Date(row.createdAt).getTime() > periodMs) return false;
      return true;
    });
  }, [rows, query, statusFilter, feedbackFilter, periodFilter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, statusFilter, feedbackFilter, periodFilter]);

  const visible = filteredRows.slice(0, visibleCount);
  const remaining = filteredRows.length - visible.length;

  async function selectRow(row: HistoryRow) {
    setLoadingDetail(true);
    try {
      const payload = await api.get<HistoryDetail>(`/admin/history/${row.responseId}`);
      setSelected(payload);
      setTranslation(null);
      setComment("");
    } catch {
      toast.error("Impossible de charger le détail.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function saveComment(state: "DRAFT" | "APPROVED") {
    if (!selected || !comment.trim()) {
      toast.error("Écrivez un commentaire avant d'enregistrer.");
      return;
    }
    try {
      await api.post(`/admin/history/${selected.responseId}/comment`, {
        comment,
        status: state,
      });
      toast.success(
        state === "APPROVED"
          ? "Correction approuvée — elle sera prise en compte pour l'optimisation IA."
          : "Brouillon enregistré.",
      );
      setComment("");
      await selectRow(selected);
    } catch {
      toast.error("Sauvegarde impossible.");
    }
  }

  async function translate(language: string) {
    if (!selected) return;
    try {
      const payload = await api.post<{ question: string; answer: string }>(
        `/admin/history/${selected.responseId}/translate`,
        { language },
      );
      setTranslation(`${payload.question}\n\n${payload.answer}`);
    } catch {
      toast.error("Traduction indisponible.");
    }
  }

  const hasSelection = !!selected;

  return (
    <AdminLayout
      title="Historique Q/R & feedback IA"
      description="Auditez les questions des consultants, les réponses de l'IA, le feedback métier, et activez des corrections pour améliorer le modèle."
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <Input
          placeholder="Rechercher par utilisateur, question ou réponse…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="lg:max-w-sm"
        />
        <Select value={feedbackFilter} onValueChange={(v) => setFeedbackFilter(v as typeof feedbackFilter)}>
          <SelectTrigger className="lg:w-48"><SelectValue placeholder="Feedback" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les retours</SelectItem>
            <SelectItem value="positive">👍 Positifs</SelectItem>
            <SelectItem value="negative">👎 Négatifs</SelectItem>
            <SelectItem value="neutral">Neutres</SelectItem>
            <SelectItem value="none">Sans feedback</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="lg:w-48"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="escalation">Escalade</SelectItem>
            <SelectItem value="fallback">Fallback</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
          <SelectTrigger className="lg:w-40"><SelectValue placeholder="Période" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute période</SelectItem>
            <SelectItem value="24h">Dernières 24 h</SelectItem>
            <SelectItem value="7d">7 derniers jours</SelectItem>
            <SelectItem value="30d">30 derniers jours</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {visible.length} / {filteredRows.length} (sur {rows.length})
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          hasSelection ? "xl:grid-cols-[minmax(0,1fr)_460px]" : "grid-cols-1",
        )}
      >
        <section className="min-w-0">
          {visible.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((row) => {
                  const fb = summarizeRowFeedback(row);
                  const isActive = selected?.responseId === row.responseId;
                  const Icon = fb.icon;
                  return (
                    <button
                      key={row.responseId}
                      onClick={() => void selectRow(row)}
                      className={cn(
                        "group flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md",
                        isActive ? "border-primary ring-2 ring-primary/30" : "border-border/70",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <User2 className="size-3.5" />
                          </div>
                          <span className="truncate text-sm font-medium text-foreground">
                            {row.userName}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(row.createdAt).toLocaleString()}>
                          {relativeTime(row.createdAt)}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                        {row.question}
                      </p>
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {row.answer}
                      </p>

                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                        {row.escalationTriggered ? (
                          <Badge variant="destructive" className="gap-1 rounded-full text-[10px]">
                            <AlertTriangle className="size-3" /> Escalade
                          </Badge>
                        ) : row.fallbackUsed ? (
                          <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
                            <Zap className="size-3" /> Fallback
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                          {row.model}
                        </Badge>
                        <Badge variant="outline" className="gap-1 rounded-full text-[10px]">
                          <Clock className="size-3" />{row.latencyMs} ms
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-[10px] tabular-nums">
                          {Math.round(row.confidence * 100)}%
                        </Badge>
                        <span className="ml-auto">
                          <Badge
                            variant={
                              fb.tone === "positive" ? "default" :
                              fb.tone === "negative" ? "destructive" :
                              fb.tone === "neutral" ? "secondary" : "outline"
                            }
                            className="gap-1 rounded-full text-[10px]"
                          >
                            {Icon ? <Icon className="size-3" /> : <MessageCircle className="size-3" />}
                            {fb.label}
                          </Badge>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {remaining > 0 && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    Afficher plus ({remaining} restants)
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="Aucune question dans cette vue"
              description="Ajustez vos filtres ou attendez les prochaines conversations consultants."
              icon={<MessageSquareText size={18} />}
            />
          )}
        </section>

        {hasSelection && (
          <aside className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <ScrollArea className="h-[calc(100vh-280px)] pr-2">
              <div className="space-y-5">
                <header>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles size={14} className="text-primary" />
                      <span>
                        {relativeTime(selected!.createdAt)} ·{" "}
                        <span className="text-muted-foreground/70">
                          {new Date(selected!.createdAt).toLocaleString()}
                        </span>
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setSelected(null)}
                      aria-label="Fermer le panneau"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Question
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-foreground">
                    {selected!.question}
                  </p>

                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Réponse IA
                  </p>
                  <p className="mt-1 rounded-xl bg-muted/60 p-3 text-sm leading-6 text-foreground">
                    {selected!.answer}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="rounded-full">
                      {selected!.provider} · {selected!.model}
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      Confiance {Math.round(selected!.confidence * 100)}%
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      {selected!.latencyMs} ms
                    </Badge>
                    {selected!.fallbackUsed && (
                      <Badge variant="secondary" className="rounded-full">
                        Fallback utilisé
                      </Badge>
                    )}
                  </div>
                </header>

                {/* Feedback consultant */}
                <section className="rounded-xl border border-border/70 bg-background p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Feedback du consultant
                  </p>
                  {selected!.feedback.length ? (
                    <div className="space-y-3">
                      {selected!.feedback.map((fb) => {
                        const tone = ratingTone(fb.rating);
                        return (
                          <div
                            key={fb.id}
                            className="rounded-lg border border-border/60 bg-card p-3 text-sm"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    tone === "positive"
                                      ? "default"
                                      : tone === "negative"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                  className="gap-1 rounded-full"
                                >
                                  {tone === "positive" ? (
                                    <ThumbsUp className="size-3" />
                                  ) : tone === "negative" ? (
                                    <ThumbsDown className="size-3" />
                                  ) : null}
                                  {ratingLabel(fb.rating)}
                                </Badge>
                                <span className="text-xs font-medium text-foreground">
                                  {fb.userName}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(fb.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {fb.comment && (
                              <p className="text-sm leading-6 text-muted-foreground">
                                {fb.comment}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Le consultant n'a pas encore donné de feedback sur cette réponse.
                    </p>
                  )}
                </section>

                {/* Feedback admin pour améliorer l'IA */}
                <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="mb-3 flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Optimisation IA — feedback admin
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Approuvez une correction pour qu'elle soit injectée dans le prochain cycle
                        de fine-tuning / RAG.
                      </p>
                    </div>
                  </div>

                  {selected!.adminComments.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {selected!.adminComments.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border/60 bg-card p-3 text-sm"
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <Badge
                              variant={item.status === "APPROVED" ? "default" : "secondary"}
                              className="rounded-full"
                            >
                              {item.status === "APPROVED" ? "Approuvée" : "Brouillon"}
                            </Badge>
                            <span>
                              {item.adminName} · {new Date(item.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="leading-6 text-foreground">{item.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <Textarea
                    className="min-h-24"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Ex. la réponse devrait citer le PMBOK 7 §3.2 et préciser le contexte aéronautique…"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void saveComment("DRAFT")}
                    >
                      <Save className="size-3.5" />
                      Brouillon
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void saveComment("APPROVED")}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Approuver pour l'IA
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void translate("en")}
                    >
                      <Languages className="size-3.5" />
                      Traduire EN
                    </Button>
                  </div>
                </section>

                {/* Sources */}
                <section className="rounded-xl border border-border/70 bg-background p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sources utilisées
                  </p>
                  {selected!.sources.length ? (
                    <div className="space-y-2">
                      {selected!.sources.map((source, idx) => (
                        <div
                          key={`${source.chunk.title}-${idx}`}
                          className="rounded-lg border border-border/60 bg-card p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-foreground">{source.chunk.title}</p>
                            <Badge variant="outline" className="rounded-full text-[11px]">
                              {source.score}%
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {source.chunk.section ?? "Section interne"}
                            {source.chunk.page ? ` · p.${source.chunk.page}` : ""}
                          </p>
                          <p className="mt-2 leading-6 text-muted-foreground">
                            {source.chunk.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucune source rattachée à cette réponse.
                    </p>
                  )}
                </section>

                {translation && (
                  <pre className="whitespace-pre-wrap rounded-xl bg-foreground p-3 text-xs leading-5 text-background">
                    {translation}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </aside>
        )}

        {!hasSelection && loadingDetail && (
          <p className="text-sm text-muted-foreground">Chargement du détail…</p>
        )}
      </div>
    </AdminLayout>
  );
}
