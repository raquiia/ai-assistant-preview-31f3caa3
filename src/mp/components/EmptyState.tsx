import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  actions
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-mp border border-dashed border-slate-300 bg-white p-6 text-slate-700 shadow-sm">
      <div className="flex items-start gap-4">
        {icon && <div className="grid h-10 w-10 shrink-0 place-items-center rounded-mp bg-slate-100 text-mp-blue">{icon}</div>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
