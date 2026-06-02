import type { ReactNode } from "react";

export function AdminLayout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mp-scrollbar h-[calc(100vh-4rem)] overflow-y-auto bg-slate-50">
      <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-5 p-4 lg:p-6">
        <header className="rounded-mp border border-slate-200 bg-white px-4 py-4 shadow-sm lg:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">Interface enterprise, data reale et etats vides explicites.</p>
            </div>
            {actions}
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
