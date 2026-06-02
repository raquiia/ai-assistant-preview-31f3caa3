import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuditEvent } from "../shared";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SystemCardPayload {
  systemCard: {
    purpose: string;
    users: string[];
    dataProcessed: string[];
    models: Array<{ provider: string; model: string; active: boolean }>;
    risks: string[];
    controls: string[];
    reviewedAt: string;
  };
}

const PAGE_SIZE = 15;

export function AuditCenter({ api }: { api: ApiClient }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [card, setCard] = useState<SystemCardPayload["systemCard"] | null>(null);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get<{ events?: AuditEvent[] }>("/superadmin/audit/events")
      .then((payload) => setEvents(payload?.events ?? []))
      .catch(() => setEvents([]));
    api
      .get<SystemCardPayload>("/superadmin/compliance/system-card")
      .then((payload) => setCard(payload?.systemCard ?? null))
      .catch(() => setCard(null));
  }, [api]);

  const actions = useMemo(() => {
    const set = new Set(events.map((event) => event.action));
    return Array.from(set).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (actionFilter !== "all" && event.action !== actionFilter) return false;
      if (!q) return true;
      const haystack = [
        event.action,
        event.entityType,
        event.entityId ?? "",
        event.actorId ?? "",
        JSON.stringify(event.metadataJson),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, query, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  useEffect(() => {
    setPage(1);
  }, [query, actionFilter]);

  async function exportCompliance() {
    const payload = await api.post<{ exportedAt: string }>(
      "/superadmin/compliance/export",
      {},
    );
    toast.success(`Export conformité généré le ${new Date(payload.exportedAt).toLocaleString()}`);
  }

  function downloadEventsJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: "application/json",
    });
    triggerDownload(blob, `audit-events-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success(`${filtered.length} événement(s) exportés en JSON`);
  }

  function downloadEventsCsv() {
    const headers = ["createdAt", "action", "entityType", "entityId", "actorId", "ip", "metadata"];
    const escape = (value: unknown) => {
      const str = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = filtered.map((event) =>
      [
        event.createdAt,
        event.action,
        event.entityType,
        event.entityId ?? "",
        event.actorId ?? "",
        event.ip ?? "",
        JSON.stringify(event.metadataJson),
      ]
        .map(escape)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `audit-events-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`${filtered.length} événement(s) exportés en CSV`);
  }

  return (
    <AdminLayout
      title="Audit, conformité & traçabilité"
      description="Suivez les actions sensibles, filtrez le journal et exportez les preuves."
      actions={
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download size={15} />
                Exporter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">
                Événements filtrés ({filtered.length})
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={downloadEventsCsv} className="gap-2">
                <FileSpreadsheet size={14} />
                Télécharger en CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={downloadEventsJson} className="gap-2">
                <FileJson size={14} />
                Télécharger en JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void exportCompliance()} className="gap-2">
                <ShieldCheck size={14} />
                Export conformité (API)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
        {/* System card */}
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground">System card</p>
              <p className="text-xs text-muted-foreground">
                Cartographie de l'usage IA et des contrôles en place.
              </p>
            </div>
          </div>
          {card ? (
            <div className="grid gap-3 md:grid-cols-3">
              <InfoBlock label="Finalité" value={card.purpose} />
              <InfoBlock label="Données" value={card.dataProcessed.join(", ")} />
              <InfoBlock label="Contrôles" value={card.controls.join(", ")} />
            </div>
          ) : (
            <EmptyState
              title="Aucune system card"
              description="La cartographie apparaîtra quand la configuration sera disponible."
              icon={<ShieldCheck size={18} />}
            />
          )}
        </section>

        {/* Filters + table */}
        <section className="rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1 md:max-w-sm">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher acteur, entité, action…"
                  className="pl-9"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="md:w-56">
                  <Filter size={14} className="mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Toutes les actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  {actions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length} / {events.length} événement(s)
            </p>
          </div>

          {paginated.length ? (
            <>
              <div className="mp-scrollbar overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Action</th>
                      <th className="px-5 py-3">Entité</th>
                      <th className="px-5 py-3">Acteur</th>
                      <th className="px-5 py-3">Metadata</th>
                      <th className="px-5 py-3 text-right">Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((event) => (
                      <tr
                        key={event.id}
                        onClick={() => setSelected(event)}
                        className={cn(
                          "cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30",
                          selected?.id === event.id && "bg-primary/5",
                        )}
                      >
                        <td className="whitespace-nowrap px-5 py-3 align-top">
                          <span className="font-mono text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                            {event.action}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <div className="flex flex-col">
                            <span className="text-foreground/90">{event.entityType}</span>
                            {event.entityId && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {event.entityId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <span className="font-mono text-xs text-muted-foreground">
                            {event.actorId ?? "—"}
                          </span>
                        </td>
                        <td className="max-w-xs px-5 py-3 align-top">
                          <code className="block truncate font-mono text-[11px] text-muted-foreground">
                            {JSON.stringify(event.metadataJson)}
                          </code>
                        </td>
                        <td className="px-5 py-3 text-right align-top">
                          <ChevronRight size={14} className="ml-auto text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 p-4 md:flex-row">
                <p className="text-xs text-muted-foreground">
                  Page {safePage} sur {totalPages} · {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)} sur {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} />
                    Précédent
                  </Button>
                  <PageNumbers current={safePage} total={totalPages} onPick={setPage} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Suivant
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              <EmptyState
                title={events.length ? "Aucun résultat" : "Aucun événement d'audit"}
                description={
                  events.length
                    ? "Ajustez la recherche ou le filtre d'action pour retrouver des événements."
                    : "Les actions sensibles seront journalisées ici dès qu'elles seront réalisées."
                }
                icon={<ShieldCheck size={18} />}
              />
            </div>
          )}
        </section>
      </div>

      {/* Details side panel */}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full max-w-md overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                    {selected.action}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                    <X size={15} />
                  </Button>
                </div>
                <SheetTitle className="font-display text-xl">
                  {selected.entityType}
                  {selected.entityId ? (
                    <span className="ml-2 font-mono text-sm text-muted-foreground">
                      {selected.entityId}
                    </span>
                  ) : null}
                </SheetTitle>
                <SheetDescription>
                  Détail complet de l'événement d'audit et metadata associée.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <DetailRow label="Date" value={new Date(selected.createdAt).toLocaleString()} />
                <DetailRow label="Acteur" value={selected.actorId ?? "—"} mono />
                <DetailRow label="Entité" value={selected.entityType} />
                <DetailRow label="ID entité" value={selected.entityId ?? "—"} mono />
                <DetailRow label="IP" value={selected.ip ?? "—"} mono />
                {selected.userAgent && (
                  <DetailRow label="User-Agent" value={selected.userAgent} mono />
                )}

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Metadata
                  </p>
                  <pre className="mp-scrollbar max-h-80 overflow-auto rounded-xl border border-border/50 bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-foreground/80">
                    {JSON.stringify(selected.metadataJson, null, 2)}
                  </pre>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                      toast.success("Événement copié dans le presse-papier");
                    }}
                  >
                    Copier le JSON
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(selected, null, 2)], {
                        type: "application/json",
                      });
                      triggerDownload(blob, `audit-event-${selected.id}.json`);
                    }}
                  >
                    <Download size={14} />
                    Télécharger
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mp-text-wrap text-sm leading-relaxed text-foreground/80">{value}</p>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mp-text-wrap text-sm text-foreground/90",
          mono && "font-mono text-xs text-foreground/80",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PageNumbers({
  current,
  total,
  onPick,
}: {
  current: number;
  total: number;
  onPick: (page: number) => void;
}) {
  const pages = useMemo(() => buildPageList(current, total), [current, total]);
  return (
    <div className="hidden items-center gap-1 px-1 md:flex">
      {pages.map((page, index) =>
        page === "…" ? (
          <span key={`gap-${index}`} className="px-1.5 text-xs text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={page}
            variant={page === current ? "default" : "ghost"}
            size="sm"
            className="h-8 min-w-8 px-2"
            onClick={() => onPick(page)}
          >
            {page}
          </Button>
        ),
      )}
    </div>
  );
}

function buildPageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
