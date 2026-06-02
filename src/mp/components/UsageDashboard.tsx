import { useEffect, useState } from "react";
import {
  CircleDollarSign,
  Coins,
  Cpu,
  Gauge as GaugeIcon,
  Layers,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/mp/auth";

interface UsageSeries {
  series: Array<{ date: string; cost: number; tokensIn: number; tokensOut: number; requests: number }>;
  totals: { cost: number; tokensIn: number; tokensOut: number; requests: number };
  byModel: Array<{ model: string; cost: number; tokens: number; requests: number; share: number }>;
  cache?: {
    hitRate: number;
    hits: number;
    misses: number;
    entries: number;
    savedCost: number;
    savedLatencyMsAvg: number;
  };
}


interface BudgetPayload {
  period: string;
  limit: number;
  used: number;
  remaining: number;
  ratio: number;
  status: "ok" | "warn" | "blocked";
  breakdown: Record<string, number>;
}

interface AdminUsage {
  totals: { cost: number; tokensIn: number; tokensOut: number; requests: number; activeUsers: number };
  topUsers: Array<{ userId: string; name: string; cost: number; requests: number; model: string }>;
  byOrg: Array<{ orgId: string; name: string; cost: number; share: number }>;
}

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono tabular-nums">{value}</div>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function UsageDashboard({ api }: { api: ApiClient }) {
  const { session } = useAuth();
  const [usage, setUsage] = useState<UsageSeries | null>(null);
  const [budget, setBudget] = useState<BudgetPayload | null>(null);
  const [admin, setAdmin] = useState<AdminUsage | null>(null);
  const isAdmin = session?.user.role === "SUPER_ADMIN";

  useEffect(() => {
    api.get<UsageSeries>("/me/usage?days=14").then(setUsage).catch(() => undefined);
    api.get<BudgetPayload>("/me/budget").then(setBudget).catch(() => undefined);
    if (isAdmin) api.get<AdminUsage>("/admin/usage").then(setAdmin).catch(() => undefined);
  }, [api, isAdmin]);

  return (
    <AdminLayout
      title="Budget · Coûts · Tokens"
      description="Suivi temps réel de la consommation IA, du budget mensuel et de la répartition par modèle."
    >
      <Tabs defaultValue="me" className="space-y-4">
        <TabsList>
          <TabsTrigger value="me">Mon usage</TabsTrigger>
          {isAdmin && <TabsTrigger value="org">Organisation</TabsTrigger>}
        </TabsList>

        <TabsContent value="me" className="space-y-4">
          {/* Budget */}
          {budget && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <GaugeIcon size={16} className="text-primary" />
                      Budget mensuel
                    </CardTitle>
                    <CardDescription>Période {budget.period}</CardDescription>
                  </div>
                  <Badge
                    variant={budget.status === "ok" ? "secondary" : "destructive"}
                    className="uppercase"
                  >
                    {budget.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={Math.round(budget.ratio * 100)} className="h-3" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Utilisé{" "}
                    <span className="font-mono text-foreground">${budget.used.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Restant{" "}
                    <span className="font-mono text-foreground">${budget.remaining.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Plafond <span className="font-mono text-foreground">${budget.limit}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t">
                  {Object.entries(budget.breakdown).map(([k, v]) => (
                    <div key={k} className="rounded border bg-muted/30 px-2 py-1.5">
                      <p className="text-[10px] uppercase text-muted-foreground">{k}</p>
                      <p className="text-sm font-mono">${v.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPIs */}
          {usage && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Coût 14 j" value={`$${usage.totals.cost.toFixed(2)}`} icon={<CircleDollarSign size={16} />} />
              <KpiCard label="Requêtes" value={usage.totals.requests.toLocaleString()} icon={<TrendingUp size={16} />} />
              <KpiCard label="Tokens in" value={`${(usage.totals.tokensIn / 1000).toFixed(0)}k`} icon={<Coins size={16} />} />
              <KpiCard label="Tokens out" value={`${(usage.totals.tokensOut / 1000).toFixed(0)}k`} icon={<Layers size={16} />} />
            </div>
          )}

          {/* Wave 6.E — LLM response cache (DynamoDB) */}
          {usage?.cache && (
            <Card className="border-emerald-500/30 bg-emerald-500/[0.03]">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      ⚡ Cache LLM (DynamoDB)
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Réponses déterministes ré-utilisées sans appel Bedrock. TTL 7 jours, contournement
                      auto si <code className="rounded bg-muted px-1 py-0.5 text-[10px]">Cache-Control: no-store</code>,
                      temperature &gt; 0.3 ou question volatile.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    {(usage.cache.hitRate * 100).toFixed(1)}% hit
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={usage.cache.hitRate * 100} className="h-1.5" />
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Hits / Misses</p>
                    <p className="mt-0.5 font-mono text-sm">
                      {usage.cache.hits} / {usage.cache.misses}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Entrées cache</p>
                    <p className="mt-0.5 font-mono text-sm">{usage.cache.entries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Coût économisé</p>
                    <p className="mt-0.5 font-mono text-sm text-emerald-600 dark:text-emerald-400">
                      ${usage.cache.savedCost.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Latence évitée /hit</p>
                    <p className="mt-0.5 font-mono text-sm">~{usage.cache.savedLatencyMsAvg} ms</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}


          {/* Charts */}
          {usage && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Coût journalier (USD)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usage.series}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu size={14} /> Répartition par modèle
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={usage.byModel}
                        dataKey="cost"
                        nameKey="model"
                        innerRadius={50}
                        outerRadius={80}
                      >
                        {usage.byModel.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend
                        wrapperStyle={{ fontSize: 10 }}
                        formatter={(v: string) => v.split(".").pop()}
                      />
                      <Tooltip
                        formatter={(v: number) => `$${v.toFixed(2)}`}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table modèles */}
          {usage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Détail par modèle</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2">Modèle</th>
                      <th className="py-2 text-right">Requêtes</th>
                      <th className="py-2 text-right">Tokens</th>
                      <th className="py-2 text-right">Coût</th>
                      <th className="py-2 text-right">Part</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byModel.map((m) => (
                      <tr key={m.model} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{m.model}</td>
                        <td className="py-2 text-right font-mono">{m.requests}</td>
                        <td className="py-2 text-right font-mono">{(m.tokens / 1000).toFixed(0)}k</td>
                        <td className="py-2 text-right font-mono">${m.cost.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono">{(m.share * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isAdmin && admin && (
          <TabsContent value="org" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard label="Coût total" value={`$${admin.totals.cost.toFixed(2)}`} icon={<CircleDollarSign size={16} />} />
              <KpiCard label="Requêtes" value={admin.totals.requests.toLocaleString()} icon={<TrendingUp size={16} />} />
              <KpiCard label="Tokens in" value={`${(admin.totals.tokensIn / 1_000_000).toFixed(1)}M`} icon={<Coins size={16} />} />
              <KpiCard label="Tokens out" value={`${(admin.totals.tokensOut / 1_000_000).toFixed(1)}M`} icon={<Layers size={16} />} />
              <KpiCard label="Utilisateurs actifs" value={String(admin.totals.activeUsers)} icon={<Users size={16} />} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Coût par organisation</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={admin.byOrg}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip
                        formatter={(v: number) => `$${v.toFixed(2)}`}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top utilisateurs</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2">Utilisateur</th>
                        <th className="py-2">Modèle</th>
                        <th className="py-2 text-right">Req.</th>
                        <th className="py-2 text-right">Coût</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admin.topUsers.map((u) => (
                        <tr key={u.userId} className="border-b last:border-0">
                          <td className="py-2">{u.name}</td>
                          <td className="py-2 font-mono text-[11px] truncate">{u.model}</td>
                          <td className="py-2 text-right font-mono">{u.requests}</td>
                          <td className="py-2 text-right font-mono">${u.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </AdminLayout>
  );
}
