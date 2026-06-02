import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AdminLayout({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8 lg:py-10">
        {(title || actions) && (
          <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            {title && (
              <div className="space-y-1.5">
                <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {description ??
                    "Interface enterprise — données réelles, états vides explicites, zéro chiffre inventé."}
                </p>
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
