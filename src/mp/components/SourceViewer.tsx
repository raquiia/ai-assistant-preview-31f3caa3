import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiClient } from "../api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-display">{payload?.chunk.title ?? "Détail de la source"}</SheetTitle>
          {payload && (
            <p className="text-xs text-muted-foreground">
              {payload.chunk.section ?? "Section interne"}
              {payload.chunk.page ? ` · Page ${payload.chunk.page}` : ""}
              {typeof payload.chunk.timeStart === "number" ? ` · ${payload.chunk.timeStart}s` : ""}
            </p>
          )}
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-5rem)] p-5">
          {payload ? (
            <div className="space-y-5">
              {(payload.chunk.industryTags?.length || payload.chunk.pmDomainTags?.length) && (
                <div className="flex flex-wrap gap-1.5">
                  {[...(payload.chunk.industryTags ?? []), ...(payload.chunk.pmDomainTags ?? [])].map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
              <section className="rounded-xl border bg-muted/40 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Passage utilisé</p>
                <p className="mp-text-wrap whitespace-pre-line text-sm leading-relaxed text-foreground">{payload.chunk.text}</p>
              </section>
              <section className="rounded-xl border bg-card p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Métadonnées</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Meta label="Paragraphe" value={payload.chunk.paragraph?.toString() ?? "—"} />
                  <Meta label="Source ID" value={payload.chunk.id} mono />
                </div>
              </section>
            </div>
          ) : (
            <EmptyState
              title="Source introuvable"
              description="Le passage demandé n'a pas pu être chargé."
              icon={<X className="size-5" />}
            />
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : ""} text-foreground`}>{value}</p>
    </div>
  );
}
