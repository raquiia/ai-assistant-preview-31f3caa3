import {
  Activity,
  CircleDollarSign,
  Clock3,
  Database,
  MessageSquareText,
  ShieldAlert,
  Smile,
  Star,
  TrendingUp,
} from "lucide-react";
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
    satisfactionRate: 0,
    feedbackCount: 0,
    averageStars: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
  };

  const hasOperationalData = useMemo(
    () =>
      Boolean(
        payload &&
          (kpis.questions > 0 ||
            metrics.length > 0 ||
            kpis.estimatedCost > 0 ||
            kpis.feedbackCount > 0),
      ),
    [kpis.estimatedCost, kpis.feedbackCount, kpis.questions, metrics.length, payload],
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
                label: "Satisfaction",
                value: kpis.feedbackCount ? `${kpis.satisfactionRate}%` : "—",
                icon: <Smile size={18} />,
                tone: "success",
                hint: kpis.feedbackCount
                  ? `${kpis.feedbackCount} retour${kpis.feedbackCount > 1 ? "s" : ""}`
                  : "Aucun retour",
              },
              {
                label: "Questions",
                value: kpis.questions,
                icon: <MessageSquareText size={18} />,
                tone: "primary",
                hint: "Sessions totales",
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

          <div className="mt-4">
            <DashboardCards
              cards={[
                {
                  label: "Utilisateurs actifs",
                  value: kpis.activeUsers,
                  icon: <Activity size={18} />,
                  tone: "primary",
                  hint: "30 derniers jours",
                },
                {
                  label: "Note moyenne",
                  value: kpis.averageStars ? `${kpis.averageStars.toFixed(1)} / 5` : "—",
                  icon: <Star size={18} />,
                  tone: "success",
                  hint: "Notes 1–5 étoiles",
                },
                {
                  label: "Latence p50",
                  value: `${kpis.latencyP50} ms`,
                  icon: <TrendingUp size={18} />,
                  tone: "default",
                  hint: "Médiane",
                },
                {
                  label: "Escalades",
                  value: `${kpis.escalationRate}%`,
                  icon: <ShieldAlert size={18} />,
                  tone: "destructive",
                  hint: "Transferts humains",
                },
              ]}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    Qualité perçue
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Retours consultants (pouces & notes).
                  </p>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-success/10 text-success">
                  <Smile size={16} />
                </div>
              </div>
              {kpis.feedbackCount > 0 ? (
                <div className="space-y-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Satisfaction globale
                      </p>
                      <p className="font-display text-3xl font-semibold text-foreground">
                        {kpis.satisfactionRate}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        sur {kpis.feedbackCount} retour{kpis.feedbackCount > 1 ? "s" : ""}
                      </p>
                    </div>
                    {kpis.averageStars > 0 && (
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Note moyenne
                        </p>
                        <p className="font-display text-3xl font-semibold text-foreground">
                          ★ {kpis.averageStars.toFixed(1)}
                          <span className="text-base text-muted-foreground"> / 5</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <StackedSatisfactionBar
                    positive={kpis.positiveCount}
                    neutral={kpis.neutralCount}
                    negative={kpis.negativeCount}
                  />

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <FeedbackChip label="Positifs" value={kpis.positiveCount} tone="success" />
                    <FeedbackChip label="Neutres" value={kpis.neutralCount} tone="muted" />
                    <FeedbackChip label="Négatifs" value={kpis.negativeCount} tone="destructive" />
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Aucun retour utilisateur"
                  description="Le taux de satisfaction s'affichera dès que les consultants noteront les réponses."
                  icon={<Smile size={16} />}
                />
              )}
            </section>

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
          </div>

          <section className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
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
        </>
      )}
    </AdminLayout>
  );
}

function StackedSatisfactionBar({
  positive,
  neutral,
  negative,
}: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  const total = Math.max(positive + neutral + negative, 1);
  const p = (positive / total) * 100;
  const n = (neutral / total) * 100;
  const d = (negative / total) * 100;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {p > 0 && <div className="h-full bg-success transition-all" style={{ width: `${p}%` }} />}
        {n > 0 && <div className="h-full bg-muted-foreground/40 transition-all" style={{ width: `${n}%` }} />}
        {d > 0 && <div className="h-full bg-destructive transition-all" style={{ width: `${d}%` }} />}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-mono text-muted-foreground">
        <span>{Math.round(p)}% positifs</span>
        <span>{Math.round(n)}% neutres</span>
        <span>{Math.round(d)}% négatifs</span>
      </div>
    </div>
  );
}

function FeedbackChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "muted" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "destructive"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="font-display text-xl font-semibold">{value}</p>
      <p className="text-[11px] uppercase tracking-wider">{label}</p>
    </div>
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
