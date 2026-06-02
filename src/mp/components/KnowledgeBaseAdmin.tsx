import { FileText, RefreshCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import type { DocumentRecord } from "../shared";
import { labelForIndustry, labelForPmDomain } from "../shared";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { UploadPanel } from "./UploadPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
            <DataTable
              rows={documents}
              getKey={(row) => row.id}
              onRowClick={(row) => void inspect(row.id)}
              columns={[
                {
                  key: "title",
                  header: "Document",
                  render: (row) => (
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <FileText size={15} className="shrink-0 text-primary" />
                      <span className="truncate">{row.title}</span>
                    </div>
                  ),
                },
                { key: "mimeType", header: "Type", render: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">{row.mimeType}</span>
                ) },
                {
                  key: "tags",
                  header: "Tags",
                  render: (row) => {
                    const tags = [
                      ...(row.industryTags ?? []).map((t) => ({ k: `i-${t}`, label: labelForIndustry(t), kind: "i" as const })),
                      ...(row.pmDomainTags ?? []).map((t) => ({ k: `d-${t}`, label: labelForPmDomain(t), kind: "d" as const })),
                    ];
                    if (tags.length === 0) return <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Générique</span>;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 3).map((t) => (
                          <span
                            key={t.k}
                            className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${t.kind === "i" ? "border border-primary/20 bg-primary/5 text-primary" : "border border-muted-foreground/20 bg-muted/60 text-muted-foreground"}`}
                          >
                            {t.label}
                          </span>
                        ))}
                        {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
                      </div>
                    );
                  },
                },
                {
                  key: "status",
                  header: "Statut",
                  render: (row) => (
                    <Badge variant={statusVariant(row.status)} className="rounded-full">
                      {row.status}
                    </Badge>
                  ),
                },
                { key: "version", header: "Version" },
                { key: "language", header: "Langue" },
                {
                  key: "createdAt",
                  header: "Date",
                  render: (row) => (
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  ),
                },
              ]}
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
