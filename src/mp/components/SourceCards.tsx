import { ExternalLink } from "lucide-react";
import type { SourceCitation } from "../shared";
import { EmptyState } from "./EmptyState";

export function SourceCards({ sources, onOpen }: { sources: SourceCitation[]; onOpen?: (chunkId: string) => void }) {
  if (!sources.length) {
    return (
      <EmptyState
        title="Aucune source"
        description="Aucune base de connaissance ou aucun provider web n'est disponible pour cette reponse."
        icon={<ExternalLink size={16} />}
      />
    );
  }

  return (
    <div className="space-y-3">
      {sources.map((source) => (
        <button
          key={source.chunkId}
          className="w-full rounded-mp border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-mp-cyan hover:shadow-md"
          onClick={() => onOpen?.(source.chunkId)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{source.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {(source.page ? `Page ${source.page}` : source.timeStart ? `Timecode ${source.timeStart}` : source.section ?? "Source interne") + " · "}
                Pertinence estimee {source.score}/100
              </p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-mp bg-slate-100 text-mp-blue">
              <ExternalLink size={15} />
            </span>
          </div>
          <p className="mp-text-wrap mt-3 text-sm leading-6 text-slate-600">{source.excerpt}</p>
        </button>
      ))}
    </div>
  );
}
