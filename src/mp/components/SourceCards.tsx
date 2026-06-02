import { ChevronRight, FileText } from "lucide-react";
import { labelForIndustry, labelForPmDomain, type SourceCitation } from "../shared";

function relevanceTone(score: number): { bar: string; text: string; bg: string } {
  if (score >= 80) return { bar: "bg-success", text: "text-success", bg: "bg-success/10" };
  if (score >= 60) return { bar: "bg-warning", text: "text-warning", bg: "bg-warning/10" };
  return { bar: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" };
}

export function SourceCards({ sources, onOpen }: { sources: SourceCitation[]; onOpen?: (chunkId: string) => void }) {
  if (!sources.length) return null;
  const sorted = [...sources].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="space-y-2">
      {sorted.map((source, idx) => {
        const score = Math.max(0, Math.min(100, source.score ?? 0));
        const tone = relevanceTone(score);
        return (
          <button
            key={source.chunkId}
            className="group flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/30 hover:shadow-soft"
            onClick={() => onOpen?.(source.chunkId)}
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="text-[10px] font-semibold tabular-nums">#{idx + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{source.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${tone.bg} ${tone.text}`}>
                  {score}%
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3" />
                {source.page ? `Page ${source.page}` : source.timeStart ? `Timecode ${source.timeStart}` : source.section ?? "Source interne"}
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${score}%` }} />
              </div>
              <p className="mp-text-wrap mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90">{source.excerpt}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </button>
        );
      })}
    </div>
  );
}
