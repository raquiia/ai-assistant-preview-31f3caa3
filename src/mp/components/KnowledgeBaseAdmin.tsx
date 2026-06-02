import { FileText, RefreshCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import type { DocumentRecord } from "../shared";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { UploadPanel } from "./UploadPanel";

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

export function KnowledgeBaseAdmin({ api, session }: { api: ApiClient; session: Session }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [sampleText, setSampleText] = useState("Le controle des couts doit relier budget, forecast, reste a faire, risques et actions de mitigation.");
  const [selected, setSelected] = useState<DocumentDetail | null>(null);
  const [status, setStatus] = useState<string>("");

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
  }, []);

  async function ingestText() {
    await api.post("/admin/kb/upload", {
      title: "Note PMO locale.md",
      mimeType: "text/markdown",
      text: sampleText
    });
    setStatus("Document envoye pour revue.");
    await refresh();
  }

  async function inspect(documentId: string) {
    const detail = await api.get<DocumentDetail>(`/admin/kb/documents/${documentId}`);
    setSelected(detail);
  }

  async function publishSelected() {
    if (!selected || session.user.role !== "SUPER_ADMIN") return;
    await api.post(`/admin/kb/documents/${selected.document.id}/publish`, {});
    setStatus("Document publie et vectorisation relancee.");
    await refresh();
  }

  async function reindexSelected() {
    if (!selected || session.user.role !== "SUPER_ADMIN") return;
    await api.post(`/admin/kb/documents/${selected.document.id}/reindex`, {});
    setStatus("Reindexation lancee.");
  }

  return (
    <AdminLayout
      title="Knowledge Base"
      actions={
        <div className="flex flex-wrap gap-2">
          <UploadPanel api={api} onUploaded={() => void refresh()} />
          <button className="flex h-10 items-center gap-2 rounded-mp border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50" onClick={() => void refresh()}>
            <RefreshCcw size={16} />
            Recharger
          </button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0 space-y-4">
          {status && <p className="rounded-mp border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700">{status}</p>}
          <div className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-slate-950">Upload texte rapide</p>
            <textarea
              className="min-h-28 w-full rounded-mp border border-slate-200 p-3 text-sm outline-none focus:border-mp-cyan"
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
            />
            <button className="mt-3 flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white shadow-sm" onClick={() => void ingestText()}>
              <UploadCloud size={16} />
              Envoyer en revue
            </button>
          </div>

          {documents.length ? (
            <DataTable
              rows={documents}
              getKey={(row) => row.id}
              columns={[
                {
                  key: "title",
                  header: "Document",
                  render: (row) => (
                    <button className="flex max-w-full items-center gap-2 text-left font-medium text-mp-blue hover:underline" onClick={() => void inspect(row.id)}>
                      <FileText size={15} className="shrink-0" />
                      <span className="truncate">{row.title}</span>
                    </button>
                  )
                },
                { key: "mimeType", header: "Type" },
                { key: "status", header: "Statut" },
                { key: "version", header: "Version" },
                { key: "language", header: "Langue" },
                { key: "createdAt", header: "Date", render: (row) => new Date(row.createdAt).toLocaleString() }
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

        <aside className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">{selected.document.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.document.status} · {selected.chunks.length} chunk(s)
                </p>
              </div>

              <div className="rounded-mp border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Statut de revue</p>
                <p>
                  {selected.document.status === "NEEDS_REVIEW"
                    ? "Document en attente de revue superadmin avant publication et vectorisation."
                    : "Document publié et disponible pour le retrieval."}
                </p>
              </div>

              {session.user.role === "SUPER_ADMIN" && selected.document.status === "NEEDS_REVIEW" && (
                <div className="flex flex-wrap gap-2">
                  <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white" onClick={() => void publishSelected()}>
                    <ShieldCheck size={15} />
                    Publier
                  </button>
                  <button className="flex h-10 items-center gap-2 rounded-mp border border-slate-200 px-3 text-sm hover:bg-slate-50" onClick={() => void reindexSelected()}>
                    <RefreshCcw size={15} />
                    Relancer la vectorisation
                  </button>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passages extraits</p>
                {selected.chunks.map((chunk) => (
                  <div key={chunk.id} className="rounded-mp border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-950">{chunk.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {chunk.section ?? "Section interne"}{chunk.page ? ` · Page ${chunk.page}` : ""}{chunk.paragraph ? ` · Paragraphe ${chunk.paragraph}` : ""}
                    </p>
                    <p className="mt-2 mp-text-wrap text-sm leading-6 text-slate-700">{chunk.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Selectionnez un document"
              description="Le panneau de droite affiche le statut, les chunks et les actions de publication superadmin."
              icon={<FileText size={18} />}
            />
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}
