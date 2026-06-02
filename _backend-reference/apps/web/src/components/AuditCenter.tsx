import { Download, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuditEvent } from "@mp/shared";
import type { ApiClient } from "../api.js";
import { AdminLayout } from "./AdminLayout.js";
import { DataTable } from "./DataTable.js";
import { EmptyState } from "./EmptyState.js";

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
  const [exportStatus, setExportStatus] = useState("");

  useEffect(() => {
    api.get<{ events: AuditEvent[] }>("/superadmin/audit/events").then((payload) => setEvents(payload.events)).catch(() => setEvents([]));
    api.get<SystemCardPayload>("/superadmin/compliance/system-card").then((payload) => setCard(payload.systemCard)).catch(() => setCard(null));
  }, [api]);

  async function exportCompliance() {
    const payload = await api.post<{ exportedAt: string }>("/superadmin/compliance/export", {});
    setExportStatus(`Export genere le ${new Date(payload.exportedAt).toLocaleString()}`);
  }

  return (
    <AdminLayout
      title="Audit, conformité et traçabilité"
      actions={
        <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white shadow-sm" onClick={() => void exportCompliance()}>
          <Download size={16} />
          Export JSON
        </button>
      }
    >
      <div className="space-y-4">
        <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={18} className="text-mp-blue" />
            <p className="text-sm font-semibold text-slate-950">System card</p>
          </div>
          {card ? (
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <InfoBlock label="Finalite" value={card.purpose} />
              <InfoBlock label="Donnees" value={card.dataProcessed.join(", ")} />
              <InfoBlock label="Controles" value={card.controls.join(", ")} />
            </div>
          ) : (
            <EmptyState
              title="Aucune system card"
              description="La cartographie apparaîtra quand la configuration sera disponible."
              icon={<ShieldCheck size={18} />}
            />
          )}
        </section>

        {exportStatus && <p className="rounded-mp border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700">{exportStatus}</p>}

        {events.length ? (
          <DataTable
            rows={events}
            columns={[
              { key: "createdAt", header: "Date", render: (row) => new Date(row.createdAt).toLocaleString() },
              { key: "action", header: "Action" },
              { key: "entityType", header: "Entite" },
              { key: "actorId", header: "Acteur" },
              { key: "metadataJson", header: "Metadata", render: (row) => <code className="text-xs">{JSON.stringify(row.metadataJson)}</code> }
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
    <div className="rounded-mp bg-slate-50 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mp-text-wrap leading-6 text-slate-700">{value}</p>
    </div>
  );
}
