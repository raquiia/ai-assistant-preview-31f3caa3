import { FileText, Filter, Pencil, RefreshCcw, Search, ShieldCheck, Tag, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DocumentRecord } from "../shared";
import { INDUSTRIES, PM_DOMAINS, labelForIndustry, labelForPmDomain } from "../shared";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { AdminLayout } from "./AdminLayout";
import { EmptyState } from "./EmptyState";
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
  return "outline";
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

  async function ingestText() {
    await api.post("/admin/kb/upload", {
      title: "Note PMO locale.md",
      mimeType: "text/markdown",
      text: sampleText,
    });
    toast.success("Document envoyé pour revue");
    await refresh();
  }

  async function inspect(documentId: string) {
    const detail = await api.get<DocumentDetail>(`/admin/kb/documents/${documentId}`);
    setSelected(detail);
  }

  async function publishSelected() {
    if (!selected || session.user.role !== "SUPER_ADMIN") return;
    await api.post(`/admin/kb/documents/${selected.document.id}/publish`, {});
    toast.success("Document publié et vectorisation relancée");
    await refresh();
  }

  async function reindexSelected() {
    if (!selected || session.user.role !== "SUPER_ADMIN") return;
    await api.post(`/admin/kb/documents/${selected.document.id}/reindex`, {});
    toast.success("Réindexation lancée");
  }

  async function updateTags(documentId: string, industryTags: string[], pmDomainTags: string[]) {
    if (session.user.role !== "SUPER_ADMIN") return;
    await api.patch(`/admin/kb/documents/${documentId}`, { industryTags, pmDomainTags });
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
