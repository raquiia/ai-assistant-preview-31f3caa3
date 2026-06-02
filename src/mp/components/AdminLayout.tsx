import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AdminLayout({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-[1600px] p-4 lg:p-6">
        {(title || actions) && (
          <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            {title && (
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Interface enterprise, data réelle, états vides explicites.</p>
              </div>
            )}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </header>
        )}
        <div>{children}</div>
      </div>
    </ScrollArea>
  );
}
