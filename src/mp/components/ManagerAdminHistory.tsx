import { Languages, MessageSquareText, MessageSquareWarning, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiClient } from "../api";
import type { HistoryRow } from "../types";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";

interface HistoryDetail extends HistoryRow {
  feedback: Array<{ id: string; userId: string; rating: string; comment?: string | null; createdAt: string }>;
  adminComments: Array<{ id: string; adminId: string; comment: string; status: string; createdAt: string }>;
  sources: Array<{ chunk: { title: string; section?: string; page?: number | null; text: string }; score: number }>;
}

export function ManagerAdminHistory({ api }: { api: ApiClient }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<HistoryDetail | null>(null);
  const [comment, setComment] = useState("");
  const [translation, setTranslation] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    api.get<{ rows: HistoryRow[] }>("/admin/history").then((payload) => setRows(payload.rows)).catch(() => setRows([]));
  }, [api]);

  async function selectRow(row: HistoryRow) {
    const payload = await api.get<HistoryDetail>(`/admin/history/${row.responseId}`);
    setSelected(payload);
    setTranslation(null);
  }

  async function saveComment(state: "DRAFT" | "APPROVED") {
    if (!selected || !comment.trim()) return;
    await api.post(`/admin/history/${selected.responseId}/comment`, { comment, status: state });
    setComment("");
    setStatus(state === "APPROVED" ? "Correction approuvee et activee." : "Commentaire enregistre.");
    await selectRow(selected);
  }

  async function translate(language: string) {
    if (!selected) return;
    const payload = await api.post<{ question: string; answer: string }>(`/admin/history/${selected.responseId}/translate`, { language });
    setTranslation(`${payload.question}\n\n${payload.answer}`);
  }

  return (
    <AdminLayout title="Historique Q/R et comportement IA">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0">
          {rows.length ? (
            <DataTable
              rows={rows}
              getKey={(row) => row.responseId}
              columns={[
                { key: "createdAt", header: "Date", render: (row) => new Date(row.createdAt).toLocaleString() },
                { key: "userName", header: "Utilisateur" },
                {
                  key: "question",
                  header: "Question",
                  render: (row) => (
                    <button className="max-w-full text-left font-medium text-mp-blue hover:underline" onClick={() => void selectRow(row)}>
                      {row.question}
                    </button>
                  )
                },
                { key: "model", header: "Modele" },
                { key: "confidence", header: "Confiance", render: (row) => `${row.confidence}/100` },
                { key: "escalationTriggered", header: "Escalade", render: (row) => (row.escalationTriggered ? "Oui" : "Non") }
              ]}
            />
          ) : (
            <EmptyState
              title="Aucune question traçable"
              description="L'historique apparaîtra après les premières conversations réelles des consultants."
              icon={<MessageSquareText size={18} />}
            />
          )}
        </section>

        <aside className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
          {status && <p className="mb-4 rounded-mp border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700">{status}</p>}
          {selected ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Sparkles size={16} className="text-mp-blue" />
                  Détail de l'échange
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{selected.question}</p>
                <p className="mt-3 rounded-mp bg-slate-50 p-3 text-sm leading-6 text-slate-700">{selected.answer}</p>
              </div>

              <div className="rounded-mp border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Commentaires admin</p>
                {selected.adminComments.length ? (
                  <div className="space-y-2">
                    {selected.adminComments.map((item) => (
                      <div key={item.id} className="rounded-mp bg-white p-3 text-sm text-slate-700 shadow-sm">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{item.status}</span>
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mp-text-wrap leading-6">{item.comment}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucun commentaire pour le moment.</p>
                )}
              </div>

              <textarea
                className="min-h-28 w-full rounded-mp border border-slate-200 p-3 text-sm outline-none focus:border-mp-cyan"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Commentaire admin pour corriger le comportement"
              />
              <div className="flex flex-wrap gap-2">
                <button className="flex h-10 items-center gap-2 rounded-mp border border-slate-200 px-3 text-sm hover:bg-slate-50" onClick={() => void saveComment("DRAFT")}>
                  <MessageSquareWarning size={15} />
                  Enregistrer brouillon
                </button>
                <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white" onClick={() => void saveComment("APPROVED")}>
                  <Sparkles size={15} />
                  Approuver et activer
                </button>
                <button className="flex h-10 items-center gap-2 rounded-mp border border-slate-200 px-3 text-sm hover:bg-slate-50" onClick={() => void translate("en")}>
                  <Languages size={15} />
                  Traduire EN
                </button>
              </div>

              <div className="rounded-mp border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sources utilisees</p>
                {selected.sources.length ? (
                  <div className="space-y-2">
                    {selected.sources.map((source) => (
                      <div key={`${source.chunk.title}-${source.score}`} className="rounded-mp bg-slate-50 p-3 text-sm">
                        <p className="font-medium text-slate-950">{source.chunk.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {source.chunk.section ?? "Section interne"} · {source.score}/100
                        </p>
                        <p className="mt-2 mp-text-wrap leading-6 text-slate-700">{source.chunk.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucune source rattachee à cette réponse.</p>
                )}
              </div>

              {translation && <pre className="whitespace-pre-wrap rounded-mp bg-slate-950 p-3 text-xs leading-5 text-white">{translation}</pre>}
            </div>
          ) : (
            <EmptyState
              title="Selectionnez une ligne"
              description="Le panneau de droite affiche le détail, les sources, les commentaires et la traduction."
              icon={<MessageSquareText size={18} />}
            />
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}
