import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/mp/auth";

interface Budget {
  period: string;
  currency: string;
  limit: number;
  used: number;
  remaining: number;
  ratio: number;
  status: "ok" | "warn" | "blocked";
  breakdown: Record<string, number>;
  resetAt: string;
}

function statusColor(s: Budget["status"]) {
  if (s === "blocked") return "text-destructive";
  if (s === "warn") return "text-amber-500";
  return "text-emerald-500";
}

export function BudgetGauge() {
  const { api, session } = useAuth();
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = () => {
      api
        .get<Budget>("/me/budget")
        .then((b) => !cancelled && setBudget(b))
        .catch(() => undefined);
    };
    load();
    const i = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [api, session]);

  if (!session || !budget) return null;
  const pct = Math.min(100, Math.round(budget.ratio * 100));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden md:flex items-center gap-2 rounded-full border bg-card/50 px-2.5 py-1 text-xs hover:bg-accent transition"
          aria-label="Budget IA"
        >
          <Wallet size={13} className={statusColor(budget.status)} />
          <span className="font-mono tabular-nums">
            ${budget.used.toFixed(2)}
            <span className="text-muted-foreground"> / ${budget.limit}</span>
          </span>
          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={
                budget.status === "blocked"
                  ? "h-full bg-destructive"
                  : budget.status === "warn"
                    ? "h-full bg-amber-500"
                    : "h-full bg-emerald-500"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Budget IA</p>
            <Badge variant={budget.status === "ok" ? "secondary" : "destructive"} className="text-[10px]">
              {budget.status === "ok" ? "OK" : budget.status === "warn" ? "Alerte" : "Bloqué"}
            </Badge>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="text-xs text-muted-foreground flex justify-between">
            <span>Période {budget.period}</span>
            <span className="font-mono">
              ${budget.used.toFixed(2)} / ${budget.limit}
            </span>
          </div>
          <div className="space-y-1.5 border-t pt-2">
            {Object.entries(budget.breakdown).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="capitalize text-muted-foreground">{k}</span>
                <span className="font-mono tabular-nums">${v.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground border-t pt-2">
            Reset le {new Date(budget.resetAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
