import { FileText, Filter, Pencil, RefreshCcw, Search, ShieldCheck, Tag, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DocumentRecord } from "../shared";
import { INDUSTRIES, PM_DOMAINS, labelForIndustry, labelForPmDomain } from "../shared";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { AdminLayout } from "./AdminLayout";
import { EmptyState } from "./EmptyState";
import { IngestionStatus } from "./IngestionStatus";
import { UploadPanel } from "./UploadPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DocumentDetail {
  document: DocumentRecord;
  chunks: Array<{
    id: string;
    title: string;
    text: string;
    page?: number;
    section?: string;
    paragraph?: number;
  }>;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "PUBLISHED") return "default";
  if (status === "NEEDS_REVIEW") return "secondary";
  if (status === "PROCESSING") return "outline";
  return "outline";
}

function statusLabel(status: string): string {
  if (status === "PROCESSING") return "OCR…";
  return status;
}

export function KnowledgeBaseAdmin({ api, session }: { api: ApiClient; session: Session }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [sampleText, setSampleText] = useState(
    "Le contrôle des coûts doit relier budget, forecast, reste à faire, risques et actions de mitigation.",
  );
  const [selected, setSelected] = useState<DocumentDetail | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [filterInd, setFilterInd] = useState<string[]>([]);
  const [filterDom, setFilterDom] = useState<string[]>([]);

  async function refresh() {
    const payload = await api.get<{ documents: DocumentRecord[] }>("/admin/kb/documents");
    setDocuments(payload.documents);
    if (selected) {
      const updated = payload.documents.find((document) => document.id === selected.document.id);
      if (updated) {
        const detail = await api.get<DocumentDetail>(`/admin/kb/documents/${updated.id}`);
        setSelected(detail);
      }
    }
  }

  useEffect(() => {
    refresh().catch(() => setDocuments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh while any document is still extracting via Textract/Transcribe.
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "PROCESSING");
    if (!hasProcessing) return;
    const id = setInterval(() => {
      refresh().catch(() => undefined);
    }, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  async function withForbidden<T>(action: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number; response?: { status?: number } })?.status
        ?? (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        toast.error(`Action refusée : vous n'avez pas le rôle requis (${action}).`);
        return undefined;
      }
      throw err;
    }
  }

  async function ingestText() {
    const ok = await withForbidden("upload KB", () =>
      api.post("/admin/kb/upload", {
        title: "Note PMO locale.md",
        mimeType: "text/markdown",
        text: sampleText,
      }),
    );
    if (ok === undefined) return;
    toast.success("Document envoyé pour revue");
    await refresh();
  }

  async function inspect(documentId: string) {
    const detail = await api.get<DocumentDetail>(`/admin/kb/documents/${documentId}`);
    setSelected(detail);
  }

  async function publishSelected() {
    if (!selected || session.user.role !== "SUPER_ADMIN") return;
    const ok = await withForbidden("publier", () =>
      api.post(`/admin/kb/documents/${selected.document.id}/publish`, {}),
    );
    if (ok === undefined) return;
    toast.success("Document publié et vectorisation relancée");
    await refresh();
  }

  async function reindexSelected() {
    if (!selected || session.user.role !== "SUPER_ADMIN") return;
    const ok = await withForbidden("réindexer", () =>
      api.post(`/admin/kb/documents/${selected.document.id}/reindex`, {}),
    );
    if (ok === undefined) return;
    toast.success("Réindexation lancée");
  }

  async function updateTags(documentId: string, industryTags: string[], pmDomainTags: string[]) {
    if (session.user.role !== "SUPER_ADMIN") return;
    const ok = await withForbidden("éditer les tags", () =>
      api.patch(`/admin/kb/documents/${documentId}`, { industryTags, pmDomainTags }),
    );
    if (ok === undefined) return;
    toast.success("Tags mis à jour");
    await refresh();
  }

  return (
    <AdminLayout
      title="Knowledge Base"
      description="Gérez la base documentaire, contrôlez les revues et la vectorisation des sources."
      actions={
        <div className="flex flex-wrap gap-2">
          <UploadPanel api={api} session={session} onUploaded={() => void refresh()} />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
            <RefreshCcw size={15} />
            Recharger
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-w-0 space-y-5">
          {session.user.role !== "SUPER_ADMIN" && (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">Lecture seule</p>
                <p className="text-xs text-muted-foreground">
                  Seul le Super Admin peut alimenter la base de connaissance vectorisée (upload, publication, réindexation).
                </p>
              </div>
            </div>
          )}

          {session.user.role === "SUPER_ADMIN" && (
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <UploadCloud size={15} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Upload texte rapide</p>
                  <p className="text-xs text-muted-foreground">Idéal pour un essai ou une note interne.</p>
                </div>
              </div>
              <Textarea
                className="min-h-28 resize-none"
                value={sampleText}
                onChange={(event) => setSampleText(event.target.value)}
              />
              <Button size="sm" className="mt-3 gap-2" onClick={() => void ingestText()}>
                <UploadCloud size={15} />
                Envoyer en revue
              </Button>
            </div>
          )}

          {documents.length ? (
            <DocumentList
              documents={documents}
              selectedId={selected?.document.id}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              filterInd={filterInd}
              setFilterInd={setFilterInd}
              filterDom={filterDom}
              setFilterDom={setFilterDom}
              onInspect={(id) => void inspect(id)}
              canEdit={session.user.role === "SUPER_ADMIN"}
              onUpdateTags={updateTags}
            />
          ) : (
            <EmptyState
              title="Aucun document indexé"
              description="Uploadez une base de connaissance pour activer les réponses sourcées. Les fichiers manager passeront d'abord en revue."
              icon={<ShieldCheck size={18} />}
            />
          )}
        </section>

        <aside className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          {selected ? (
            <div className="space-y-5">
              <div>
                <p className="font-display text-base font-semibold text-foreground">
                  {selected.document.title}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(selected.document.status)} className="rounded-full">
                    {selected.document.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selected.chunks.length} chunk(s)
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/40 p-4 text-sm text-foreground/80">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tags
                  </p>
                  {session.user.role === "SUPER_ADMIN" && (
                    <TagEditor
                      industryTags={selected.document.industryTags ?? []}
                      pmDomainTags={selected.document.pmDomainTags ?? []}
                      onSave={(ind, dom) => updateTags(selected.document.id, ind, dom)}
                    />
                  )}
                </div>
                <TagList
                  industryTags={selected.document.industryTags ?? []}
                  pmDomainTags={selected.document.pmDomainTags ?? []}
                />
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/40 p-4 text-sm text-foreground/80">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Statut de revue
                </p>
                <p className="leading-relaxed">
                  {selected.document.status === "NEEDS_REVIEW"
                    ? "Document en attente de revue superadmin avant publication et vectorisation."
                    : "Document publié et disponible pour le retrieval."}
                </p>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pipeline d'ingestion AWS
                </p>
                <IngestionStatus api={api} documentId={selected.document.id} />
              </div>


              {session.user.role === "SUPER_ADMIN" &&
                selected.document.status === "NEEDS_REVIEW" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-2" onClick={() => void publishSelected()}>
                      <ShieldCheck size={15} />
                      Publier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void reindexSelected()}
                    >
                      <RefreshCcw size={15} />
                      Relancer la vectorisation
                    </Button>
                  </div>
                )}

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Passages extraits
                </p>
                <div className="space-y-2.5">
                  {selected.chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="rounded-xl border border-border/50 bg-muted/30 p-3.5 transition-colors hover:bg-muted/50"
                    >
                      <p className="text-sm font-medium text-foreground">{chunk.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {chunk.section ?? "Section interne"}
                        {chunk.page ? ` · Page ${chunk.page}` : ""}
                        {chunk.paragraph ? ` · § ${chunk.paragraph}` : ""}
                      </p>
                      <p className="mp-text-wrap mt-2 text-sm leading-relaxed text-foreground/80">
                        {chunk.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Sélectionnez un document"
              description="Le panneau de droite affiche le statut, les chunks et les actions de publication superadmin."
              icon={<FileText size={18} />}
            />
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}

function DocumentList({
  documents,
  selectedId,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  filterInd,
  setFilterInd,
  filterDom,
  setFilterDom,
  onInspect,
  canEdit,
  onUpdateTags,
}: {
  documents: DocumentRecord[];
  selectedId?: string;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  filterInd: string[];
  setFilterInd: (v: string[]) => void;
  filterDom: string[];
  setFilterDom: (v: string[]) => void;
  onInspect: (id: string) => void;
  canEdit: boolean;
  onUpdateTags: (id: string, ind: string[], dom: string[]) => Promise<void>;
}) {
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (q && !d.title.toLowerCase().includes(q)) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (filterInd.length && !filterInd.some((t) => (d.industryTags ?? []).includes(t))) return false;
      if (filterDom.length && !filterDom.some((t) => (d.pmDomainTags ?? []).includes(t))) return false;
      return true;
    });
  }, [documents, search, statusFilter, filterInd, filterDom]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, statusFilter, filterInd, filterDom]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;
  const activeFilters = filterInd.length + filterDom.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un document…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous statuts</SelectItem>
            <SelectItem value="NEEDS_REVIEW">À revoir</SelectItem>
            <SelectItem value="PUBLISHED">Publiés</SelectItem>
            <SelectItem value="PROCESSING">En cours</SelectItem>
            <SelectItem value="ARCHIVED">Archivés</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Filter className="size-3.5" />
              Tags
              {activeFilters > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 rounded-full px-1.5 text-[10px]">
                  {activeFilters}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-xs font-semibold">Filtrer par tags</p>
              {activeFilters > 0 && (
                <button
                  onClick={() => {
                    setFilterInd([]);
                    setFilterDom([]);
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" /> Réinitialiser
                </button>
              )}
            </div>
            <ScrollArea className="max-h-80">
              <div className="space-y-3 p-3">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Secteurs
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {INDUSTRIES.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={filterInd.includes(opt.value)}
                          onCheckedChange={() =>
                            setFilterInd(
                              filterInd.includes(opt.value)
                                ? filterInd.filter((v) => v !== opt.value)
                                : [...filterInd, opt.value],
                            )
                          }
                          className="size-3.5"
                        />
                        <span className="truncate">{labelForIndustry(opt.value)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Domaines PM
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {PM_DOMAINS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={filterDom.includes(opt.value)}
                          onCheckedChange={() =>
                            setFilterDom(
                              filterDom.includes(opt.value)
                                ? filterDom.filter((v) => v !== opt.value)
                                : [...filterDom, opt.value],
                            )
                          }
                          className="size-3.5"
                        />
                        <span className="truncate">{labelForPmDomain(opt.value)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {visible.length} / {filtered.length}
          {filtered.length !== documents.length ? ` (sur ${documents.length})` : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Aucun document ne correspond aux filtres.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                selected={doc.id === selectedId}
                onClick={() => onInspect(doc.id)}
                canEdit={canEdit}
                onUpdateTags={(ind, dom) => onUpdateTags(doc.id, ind, dom)}
              />
            ))}
          </div>
          {remaining > 0 && (
            <div className="flex items-center justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="gap-2"
              >
                Afficher plus
                <span className="text-xs text-muted-foreground">
                  ({Math.min(PAGE_SIZE, remaining)} de plus · {remaining} restant{remaining > 1 ? "s" : ""})
                </span>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  selected,
  onClick,
  canEdit,
  onUpdateTags,
}: {
  doc: DocumentRecord;
  selected: boolean;
  onClick: () => void;
  canEdit: boolean;
  onUpdateTags: (ind: string[], dom: string[]) => Promise<void>;
}) {
  const meta = [doc.mimeType, `v${doc.version}`, doc.language?.toUpperCase(), new Date(doc.createdAt).toLocaleDateString()]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group block w-full rounded-xl border bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:shadow-soft",
        selected ? "border-primary/60 ring-1 ring-primary/30 shadow-soft" : "border-border/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
            <Badge
              variant={statusVariant(doc.status)}
              className={cn(
                "shrink-0 rounded-full text-[10px]",
                doc.status === "PROCESSING" && "animate-pulse border-primary/50 text-primary"
              )}
              title={doc.status === "PROCESSING" ? "Extraction OCR Textract en cours" : undefined}
            >
              {statusLabel(doc.status)}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <TagList
                industryTags={doc.industryTags ?? []}
                pmDomainTags={doc.pmDomainTags ?? []}
              />
            </div>
            {canEdit && (
              <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                <TagEditor
                  industryTags={doc.industryTags ?? []}
                  pmDomainTags={doc.pmDomainTags ?? []}
                  onSave={onUpdateTags}
                />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function TagList({
  industryTags,
  pmDomainTags,
  max,
}: {
  industryTags: string[];
  pmDomainTags: string[];
  max?: number;
}) {
  const tags = [
    ...industryTags.map((t) => ({ k: `i-${t}`, label: labelForIndustry(t), kind: "i" as const })),
    ...pmDomainTags.map((t) => ({ k: `d-${t}`, label: labelForPmDomain(t), kind: "d" as const })),
  ];
  if (tags.length === 0) {
    return (
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        Générique
      </span>
    );
  }
  const shown = max ? tags.slice(0, max) : tags;
  const hidden = max ? tags.length - shown.length : 0;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <span
          key={t.k}
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            t.kind === "i"
              ? "border border-primary/20 bg-primary/5 text-primary"
              : "border border-muted-foreground/20 bg-muted/60 text-muted-foreground"
          }`}
        >
          {t.label}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-[10px] text-muted-foreground">+{hidden}</span>
      )}
    </div>
  );
}

function TagEditor({
  industryTags,
  pmDomainTags,
  onSave,
}: {
  industryTags: string[];
  pmDomainTags: string[];
  onSave: (industryTags: string[], pmDomainTags: string[]) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [ind, setInd] = useState<string[]>(industryTags);
  const [dom, setDom] = useState<string[]>(pmDomainTags);

  useEffect(() => {
    if (open) {
      setInd(industryTags);
      setDom(pmDomainTags);
    }
  }, [open, industryTags, pmDomainTags]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    await onSave(ind, dom);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          title="Modifier les tags"
        >
          <Pencil className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs font-semibold">
            <Tag className="mr-1 inline size-3" /> Tags du document
          </p>
          <button
            onClick={() => {
              setInd([]);
              setDom([]);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Tout effacer
          </button>
        </div>
        <ScrollArea className="max-h-80">
          <div className="space-y-3 p-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Secteurs
              </p>
              <div className="grid grid-cols-2 gap-1">
                {INDUSTRIES.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={ind.includes(opt.value)}
                      onCheckedChange={() => toggle(ind, setInd, opt.value)}
                      className="size-3.5"
                    />
                    <span className="truncate">{labelForIndustry(opt.value)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Domaines PM
              </p>
              <div className="grid grid-cols-2 gap-1">
                {PM_DOMAINS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={dom.includes(opt.value)}
                      onCheckedChange={() => toggle(dom, setDom, opt.value)}
                      className="size-3.5"
                    />
                    <span className="truncate">{labelForPmDomain(opt.value)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
