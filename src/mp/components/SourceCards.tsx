import { ChevronRight, FileText } from "lucide-react";
import type { SourceCitation } from "../shared";

export function SourceCards({ sources, onOpen }: { sources: SourceCitation[]; onOpen?: (chunkId: string) => void }) {
  if (!sources.length) return null;

  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <button
          key={source.chunkId}
          className="group flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/30 hover:shadow-soft"
          onClick={() => onOpen?.(source.chunkId)}
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{source.title}</p>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {source.score}/100
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {source.page ? `Page ${source.page}` : source.timeStart ? `Timecode ${source.timeStart}` : source.section ?? "Source interne"}
            </p>
            <p className="mp-text-wrap mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90">{source.excerpt}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}
