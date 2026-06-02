import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "destructive";

const toneStyles: Record<Tone, string> = {
  default: "from-muted/60 to-muted/20 text-foreground",
  primary: "from-primary/15 to-primary/5 text-primary",
  success: "from-success/15 to-success/5 text-success",
  warning: "from-warning/15 to-warning/5 text-warning",
  destructive: "from-destructive/15 to-destructive/5 text-destructive",
};

export function DashboardCards({
  cards,
}: {
  cards: Array<{
    label: string;
    value: string | number;
    icon?: ReactNode;
    hint?: string;
    tone?: Tone;
  }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const tone = card.tone ?? "primary";
        return (
          <div
            key={card.label}
            className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div
              className={cn(
                "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-60 blur-2xl transition-opacity group-hover:opacity-90",
                toneStyles[tone],
              )}
              aria-hidden
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </p>
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
                  {card.value}
                </p>
                {card.hint && (
                  <p className="text-xs text-muted-foreground">{card.hint}</p>
                )}
              </div>
              {card.icon && (
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-border/50",
                    toneStyles[tone],
                  )}
                >
                  {card.icon}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
