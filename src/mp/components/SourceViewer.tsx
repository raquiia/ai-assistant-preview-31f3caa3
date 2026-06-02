import { ArrowLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiClient } from "../api";
import { EmptyState } from "./EmptyState";

interface SourcePayload {
  chunk: {
    id: string;
    title: string;
    text: string;
    page?: number;
    section?: string;
    paragraph?: number;
    timeStart?: number | null;
    timeEnd?: number | null;
    industryTags: string[];
    pmDomainTags: string[];
  };
}

export function SourceViewer({ api, chunkId, onClose }: { api: ApiClient; chunkId: string; onClose: () => void }) {
  const [payload, setPayload] = useState<SourcePayload | null>(null);

  useEffect(() => {
    api.get<SourcePayload>(`/source/${chunkId}`).then(setPayload).catch(() => setPayload(null));
  }, [api, chunkId]);

  return (
    <aside className="fixed inset-0 z-30 bg-slate-950/25 backdrop-blur-sm">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 lg:px-5">
          <button className="flex h-10 items-center gap-2 rounded-mp border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
            <ArrowLeft size={16} />
            Retour
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-mp border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" onClick={onClose} title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="mp-scrollbar min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
          {payload ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold text-slate-950">{payload.chunk.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {payload.chunk.section ?? "Section interne"}
                  {payload.chunk.page ? ` · Page ${payload.chunk.page}` : ""}
                  {typeof payload.chunk.timeStart === "number" ? ` · ${payload.chunk.timeStart}s` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...(payload.chunk.industryTags ?? []), ...(payload.chunk.pmDomainTags ?? [])].map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
              <section className="rounded-mp border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Passage utilise</p>
                <p className="mp-text-wrap text-sm leading-7 text-slate-800">{payload.chunk.text}</p>
              </section>
              <section className="rounded-mp border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Metadonnees</p>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Meta label="Paragraphe" value={payload.chunk.paragraph?.toString() ?? "Non renseigne"} />
                  <Meta label="Source" value={payload.chunk.id} />
                </div>
              </section>
            </div>
          ) : (
            <EmptyState
              title="Source introuvable"
              description="Le passage demande n'a pas pu etre charge."
              icon={<X size={16} />}
              actions={<button className="h-9 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white" onClick={onClose}>Fermer</button>}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-mp bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  );
}
