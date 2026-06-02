import { Activity, CircleDollarSign, Clock3, Database, MessageSquareText, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../api.js";
import type { DashboardPayload } from "../types.js";
import { AdminLayout } from "./AdminLayout.js";
import { DashboardCards } from "./DashboardCards.js";
import { EmptyState } from "./EmptyState.js";

export function SuperAdminDashboard({ api }: { api: ApiClient }) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    api.get<DashboardPayload>("/admin/dashboard").then(setPayload).catch(() => setPayload(null));
  }, [api]);

  const metrics = payload?.metrics ?? [];
  const kpis = payload?.kpis ?? {
    questions: 0,
    activeUsers: 0,
    fallbackRate: 0,
    escalationRate: 0,
    latencyP50: 0,
    latencyP95: 0,
    estimatedCost: 0
  };

  const hasOperationalData = useMemo(() => Boolean(payload && (kpis.questions > 0 || metrics.length > 0 || kpis.estimatedCost > 0)), [kpis.estimatedCost, kpis.questions, metrics.length, payload]);

  return (
    <AdminLayout title="Dashboard metier et technique">
      {!hasOperationalData ? (
        <EmptyState
          title="Aucune donnee disponible pour le moment"
          description="Les KPI apparaîtront après les premieres conversations réelles, les uploads de connaissances et les retours utilisateurs."
          icon={<ShieldAlert size={18} />}
          actions={
            <>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Pas de chiffre invente</div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">KPI calcules uniquement sur le reel</div>
            </>
          }
        />
      ) : (
        <>
          <DashboardCards
            cards={[
              { label: "Questions", value: kpis.questions, icon: <MessageSquareText size={18} /> },
              { label: "Utilisateurs actifs", value: kpis.activeUsers, icon: <Activity size={18} /> },
              { label: "Fallback", value: `${kpis.fallbackRate}%`, icon: <Clock3 size={18} /> },
              { label: "Cout estime", value: `${kpis.estimatedCost.toFixed(2)} EUR`, icon: <CircleDollarSign size={18} /> }
            ]}
          />
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Latence et qualite</p>
                  <p className="text-xs text-slate-500">Mesures issues des reponses réelles.</p>
                </div>
                <Database size={16} className="text-slate-400" />
              </div>
              <MetricBar label="p50" value={kpis.latencyP50} max={Math.max(kpis.latencyP95, 1)} suffix="ms" />
              <MetricBar label="p95" value={kpis.latencyP95} max={Math.max(kpis.latencyP95, 1)} suffix="ms" />
              <MetricBar label="Fallback" value={kpis.fallbackRate} max={100} suffix="%" />
              <MetricBar label="Escalade" value={kpis.escalationRate} max={100} suffix="%" />
            </section>
            <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Journal d'activite</p>
                  <p className="text-xs text-slate-500">Les donnees visibles ici viennent du flux operational.</p>
                </div>
                <Activity size={16} className="text-slate-400" />
              </div>
              {metrics.length ? (
                <div className="space-y-3">
                  {metrics.map((metric) => (
                    <div key={metric.metricName} className="rounded-mp border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-900">{metric.metricName}</span>
                        <span className="text-slate-600">{metric.value}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{JSON.stringify(metric.dimensionsJson)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Aucun KPI journalier"
                  description="Les métriques quotidiennes seront calculees après les premieres interactions et ingestion reelles."
                  icon={<Activity size={16} />}
                />
              )}
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function MetricBar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix: string }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-mp-cyan" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
