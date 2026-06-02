import {
  Bot,
  ClipboardCheck,
  Database,
  Gauge,
  History,
  KeyRound,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/mp/auth";
import type { Role } from "@/mp/shared";
import type { ViewKey } from "@/mp/types";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: typeof Bot;
  roles: Role[];
  group: "work" | "admin";
  badgeKey?: "approvals";
}

const NAV: NavItem[] = [
  { key: "chat", label: "Chat", icon: MessageSquareText, roles: ["CONSULTANT", "MANAGER", "SUPER_ADMIN"], group: "work" },
  { key: "history", label: "Historique", icon: History, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"], group: "work" },
  { key: "dashboard", label: "Dashboard", icon: Gauge, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"], group: "work" },
  { key: "kb", label: "Knowledge Base", icon: Database, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"], group: "work" },
  { key: "approvals", label: "Approbations", icon: UserCheck, roles: ["MANAGER", "SUPER_ADMIN"], group: "admin", badgeKey: "approvals" },
  { key: "users", label: "Utilisateurs", icon: Users, roles: ["SUPER_ADMIN"], group: "admin" },
  { key: "prompts", label: "Prompts & modèles", icon: KeyRound, roles: ["SUPER_ADMIN"], group: "admin" },
  { key: "audit", label: "Audit", icon: ShieldCheck, roles: ["SUPER_ADMIN", "AUDITOR"], group: "admin" },
  { key: "embed", label: "Embed", icon: ClipboardCheck, roles: ["SUPER_ADMIN"], group: "admin" },
];


function roleLabel(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN": return "Super Admin";
    case "MANAGER": return "Manager";
    case "AUDITOR": return "Auditeur";
    case "CONSULTANT": return "Consultant";
  }
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
}

export function AppSidebar({ view, onChangeView }: { view: ViewKey; onChangeView: (v: ViewKey) => void }) {
  const { session, logout, api } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const items = useMemo(
    () => (session ? NAV.filter((n) => n.roles.includes(session.user.role)) : []),
    [session],
  );
  const workItems = items.filter((i) => i.group === "work");
  const adminItems = items.filter((i) => i.group === "admin");

  useEffect(() => {
    if (!session) return;
    if (!(session.user.role === "MANAGER" || session.user.role === "SUPER_ADMIN")) return;
    let cancelled = false;
    const fetchCount = () => {
      api
        .get<{ count: number }>("/notifications/pending-count")
        .then((p) => {
          if (!cancelled) setPendingApprovals(p?.count ?? 0);
        })
        .catch(() => undefined);
    };
    fetchCount();
    const interval = setInterval(fetchCount, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api, session, view]);

  if (!session) return null;

  const badgeFor = (item: NavItem): number => {
    if (item.badgeKey === "approvals") return pendingApprovals;
    return 0;
  };


  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <Sparkles size={16} strokeWidth={2.4} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold leading-tight">MIGSO-PCUBED</p>
              <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">AI Assistant</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Espace de travail</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {workItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.key;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => onChangeView(item.key)}
                      tooltip={item.label}
                      className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold"
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Administration</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.key;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={active}
                        onClick={() => onChangeView(item.key)}
                        tooltip={item.label}
                        className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold"
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="size-8 ring-2 ring-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials(session.user.name)}</AvatarFallback>
            </Avatar>
            <SidebarMenuButton onClick={logout} tooltip="Déconnexion" className="size-8 justify-center p-0">
              <LogOut className="size-4" />
            </SidebarMenuButton>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-lg bg-sidebar-accent px-2.5 py-2">
              <Avatar className="size-9 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials(session.user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{session.user.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success pulse-dot" />
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">{roleLabel(session.user.role)}</Badge>
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" /> Déconnexion
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
