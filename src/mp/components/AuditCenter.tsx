import { Download, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuditEvent } from "../shared";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export function AuditCenter({ api }: { api: ApiClient }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [card, setCard] = useState<SystemCardPayload["systemCard"] | null>(null);

  useEffect(() => {
    api
      .get<{ events: AuditEvent[] }>("/superadmin/audit/events")
      .then((payload) => setEvents(payload.events))
      .catch(() => setEvents([]));
    api
      .get<SystemCardPayload>("/superadmin/compliance/system-card")
      .then((payload) => setCard(payload.systemCard))
      .catch(() => setCard(null));
  }, [api]);

  async function exportCompliance() {
    const payload = await api.post<{ exportedAt: string }>("/superadmin/compliance/export", {});
    toast.success(`Export généré le ${new Date(payload.exportedAt).toLocaleString()}`);
  }

  return (
    <AdminLayout
      title="Audit, conformité & traçabilité"
      description="Suivez les actions sensibles, exportez les preuves et consultez la system card."
      actions={
        <Button onClick={() => void exportCompliance()} className="gap-2">
          <Download size={15} />
          Export JSON
        </Button>
      }
    >
      <div className="space-y-6">
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

        {events.length ? (
          <DataTable
            rows={events}
            columns={[
              {
                key: "createdAt",
                header: "Date",
                render: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                ),
              },
              {
                key: "action",
                header: "Action",
                render: (row) => (
                  <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                    {row.action}
                  </Badge>
                ),
              },
              { key: "entityType", header: "Entité" },
              {
                key: "actorId",
                header: "Acteur",
                render: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">{row.actorId}</span>
                ),
              },
              {
                key: "metadataJson",
                header: "Metadata",
                render: (row) => (
                  <code className="block max-w-xs truncate font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(row.metadataJson)}
                  </code>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="Aucun événement d'audit"
            description="Les actions sensibles seront journalisées ici dès qu'elles seront réalisées."
            icon={<ShieldCheck size={18} />}
          />
        )}
      </div>
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
