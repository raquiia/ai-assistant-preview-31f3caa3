import type { ReactNode } from "react";

export function DashboardCards({ cards }: { cards: Array<{ label: string; value: string | number; icon?: ReactNode; tone?: "blue" | "cyan" | "green" | "red" }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{card.value}</p>
            </div>
            {card.icon && <div className="grid h-10 w-10 shrink-0 place-items-center rounded-mp bg-blue-50 text-mp-blue">{card.icon}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
