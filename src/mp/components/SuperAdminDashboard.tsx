import { Activity, CircleDollarSign, Clock3, Database, MessageSquareText, ShieldAlert, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../api";
import type { DashboardPayload } from "../types";
import { AdminLayout } from "./AdminLayout";
import { DashboardCards } from "./DashboardCards";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/badge";

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
    estimatedCost: 0,
  };

  const hasOperationalData = useMemo(
    () => Boolean(payload && (kpis.questions > 0 || metrics.length > 0 || kpis.estimatedCost > 0)),
    [kpis.estimatedCost, kpis.questions, metrics.length, payload],
  );

  return (
    <AdminLayout
      title="Dashboard métier & technique"
      description="Indicateurs calculés en temps réel sur la base des conversations, ingestions et retours utilisateurs."
    >
      {!hasOperationalData ? (
        <EmptyState
          title="Aucune donnée opérationnelle"
          description="Les KPI apparaîtront dès les premières conversations réelles, les uploads de connaissances et les retours utilisateurs."
          icon={<ShieldAlert size={20} />}
          actions={
            <>
              <Badge variant="secondary" className="rounded-full">Zéro chiffre inventé</Badge>
              <Badge variant="secondary" className="rounded-full">KPI calculés sur le réel</Badge>
            </>
          }
        />
      ) : (
        <>
          <DashboardCards
            cards={[
              {
                label: "Questions",
                value: kpis.questions,
                icon: <MessageSquareText size={18} />,
                tone: "primary",
                hint: "Sessions totales",
              },
              {
                label: "Utilisateurs actifs",
                value: kpis.activeUsers,
                icon: <Activity size={18} />,
                tone: "success",
                hint: "30 derniers jours",
              },
              {
                label: "Taux de fallback",
                value: `${kpis.fallbackRate}%`,
                icon: <Clock3 size={18} />,
                tone: "warning",
                hint: "Réponses sans source",
              },
              {
                label: "Coût estimé",
                value: `${kpis.estimatedCost.toFixed(2)} €`,
                icon: <CircleDollarSign size={18} />,
                tone: "default",
                hint: "Cumul provider",
              },
            ]}
          />

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    Latence & qualité
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Mesures issues des réponses réelles.
                  </p>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="space-y-4">
                <MetricBar label="Latence p50" value={kpis.latencyP50} max={Math.max(kpis.latencyP95, 1)} suffix="ms" tone="primary" />
                <MetricBar label="Latence p95" value={kpis.latencyP95} max={Math.max(kpis.latencyP95, 1)} suffix="ms" tone="primary" />
                <MetricBar label="Fallback" value={kpis.fallbackRate} max={100} suffix="%" tone="warning" />
                <MetricBar label="Escalade" value={kpis.escalationRate} max={100} suffix="%" tone="destructive" />
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    Journal d'activité
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Données issues du flux opérationnel.
                  </p>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Database size={16} />
                </div>
              </div>
              {metrics.length ? (
                <div className="space-y-2">
                  {metrics.map((metric) => (
                    <div
                      key={metric.metricName}
                      className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">{metric.metricName}</span>
                        <span className="font-mono text-foreground/80">{metric.value}</span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(metric.dimensionsJson)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Aucun KPI journalier"
                  description="Les métriques quotidiennes seront calculées après les premières interactions."
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

function MetricBar({
  label,
  value,
  max,
  suffix,
  tone = "primary",
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  tone?: "primary" | "warning" | "destructive";
}) {
  const pct = Math.min(100, (value / max) * 100);
  const toneClass =
    tone === "warning" ? "bg-warning" : tone === "destructive" ? "bg-destructive" : "bg-primary";
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${toneClass} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
