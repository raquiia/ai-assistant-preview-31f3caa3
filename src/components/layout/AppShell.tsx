import { useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import type { ViewKey } from "@/mp/types";

export interface ShellViewMeta {
  key: ViewKey;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  content: ReactNode;
}

export function AppShell({
  views,
  initialView,
}: {
  views: ShellViewMeta[];
  initialView: ViewKey;
}) {
  const [view, setView] = useState<ViewKey>(initialView);
  const current = views.find((v) => v.key === view) ?? views[0];

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar view={current.key} onChangeView={(k) => setView(k)} />
      <SidebarInset className="flex h-screen min-w-0 flex-col bg-background">
        <AppHeader title={current.title} subtitle={current.subtitle} actions={current.actions} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{current.content}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
