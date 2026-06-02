import {
  Bot,
  BriefcaseBusiness,
  ClipboardCheck,
  Database,
  Gauge,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";
import { useMemo, useState } from "react";
import { branding } from "@mp/config";
import type { Role } from "@mp/shared";
import { ApiClient } from "./api.js";
import { AuditCenter } from "./components/AuditCenter.js";
import { ChatShell } from "./components/ChatShell.js";
import { EmbedPreview } from "./components/EmbedPreview.js";
import { FirstVisitManagerSelection } from "./components/FirstVisitManagerSelection.js";
import { KnowledgeBaseAdmin } from "./components/KnowledgeBaseAdmin.js";
import { LoginPage } from "./components/LoginPage.js";
import { ManagerAdminHistory } from "./components/ManagerAdminHistory.js";
import { PromptAndModelSettings } from "./components/PromptAndModelSettings.js";
import { SuperAdminDashboard } from "./components/SuperAdminDashboard.js";
import { UserManagement } from "./components/UserManagement.js";
import type { Session, ViewKey } from "./types.js";

const nav = [
  { key: "chat", label: "Chat", icon: MessageSquareText, roles: ["CONSULTANT", "MANAGER", "SUPER_ADMIN"] },
  { key: "history", label: "Historique Q/R", icon: History, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"] },
  { key: "dashboard", label: "Dashboard", icon: Gauge, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"] },
  { key: "kb", label: "Knowledge Base", icon: Database, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"] },
  { key: "users", label: "Utilisateurs", icon: Users, roles: ["SUPER_ADMIN"] },
  { key: "prompts", label: "Prompts & modeles", icon: KeyRound, roles: ["SUPER_ADMIN"] },
  { key: "audit", label: "Audit", icon: ShieldCheck, roles: ["SUPER_ADMIN", "AUDITOR"] },
  { key: "embed", label: "Embed", icon: ClipboardCheck, roles: ["SUPER_ADMIN"] }
] satisfies Array<{ key: ViewKey; label: string; icon: typeof Bot; roles: Role[] }>;

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = localStorage.getItem("mp-session");
    return stored ? (JSON.parse(stored) as Session) : null;
  });
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem("mp-nav-collapsed") === "true");
  const [view, setView] = useState<ViewKey>("chat");
  const api = useMemo(() => new ApiClient(() => session), [session]);

  function handleSession(next: Session | null) {
    setSession(next);
    if (next) localStorage.setItem("mp-session", JSON.stringify(next));
    else localStorage.removeItem("mp-session");
  }

  if (!session) {
    return <LoginPage onLogin={handleSession} />;
  }

  if (session.user.role === "CONSULTANT" && session.user.status === "PENDING_MANAGER") {
    return <FirstVisitManagerSelection api={api} session={session} onSession={handleSession} />;
  }

  const items = nav.filter((item) => item.roles.includes(session.user.role));
  const active = items.some((item) => item.key === view) ? view : items[0]!.key;
  const activeItem = items.find((item) => item.key === active) ?? items[0]!;

  function toggleSidebar() {
    setNavCollapsed((current) => {
      const next = !current;
      localStorage.setItem("mp-nav-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <aside className={`hidden shrink-0 border-r border-slate-200 bg-mp-navy text-white transition-[width] duration-200 lg:flex lg:flex-col ${navCollapsed ? "w-[88px]" : "w-72"}`}>
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-mp bg-white text-mp-navy">
              <BriefcaseBusiness size={20} />
            </div>
            {!navCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{branding.companyName}</p>
                <p className="truncate text-xs text-cyan-100">{branding.productName}</p>
              </div>
            )}
          </div>
        </div>
        <nav className={`flex-1 space-y-1 py-4 ${navCollapsed ? "px-2" : "px-3"}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <button
                key={item.key}
                className={`flex h-10 w-full items-center rounded-mp text-left text-sm transition ${
                  selected ? "bg-white text-mp-navy" : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
                title={item.label}
                onClick={() => setView(item.key)}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center ${navCollapsed ? "mx-auto" : ""}`}>
                  <Icon size={17} />
                </span>
                {!navCollapsed && <span className="truncate pr-2">{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className={`mb-3 rounded-mp bg-white/8 p-3 ${navCollapsed ? "text-center" : ""}`}>
            {navCollapsed ? (
              <div className="grid h-10 w-10 place-items-center rounded-mp bg-white/10 text-white">
                <UserRound size={18} />
              </div>
            ) : (
              <p className="truncate text-sm font-medium">{session.user.name}</p>
            )}
            {!navCollapsed && <p className="truncate text-xs text-cyan-100">{session.user.role}</p>}
          </div>
          <button className="flex h-10 w-full items-center rounded-mp text-sm text-slate-200 hover:bg-white/10" title="Deconnexion" onClick={() => handleSession(null)}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center ${navCollapsed ? "mx-auto" : ""}`}>
              <LogOut size={17} />
            </span>
            {!navCollapsed && <span>Deconnexion</span>}
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <LayoutDashboard className="text-mp-blue" size={20} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{activeItem.label}</p>
              <p className="truncate text-xs text-slate-500">{session.user.department ?? "MIGSO-PCUBED"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden h-10 w-10 items-center justify-center rounded-mp border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:inline-flex" title={navCollapsed ? "Ouvrir le menu" : "Réduire le menu"} onClick={toggleSidebar}>
              {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <select className="h-10 rounded-mp border border-slate-200 bg-white px-3 text-sm lg:hidden" value={active} onChange={(event) => setView(event.target.value as ViewKey)}>
              {items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </header>
        <section className="min-h-0 flex-1 overflow-hidden">
          {active === "chat" && <ChatShell api={api} session={session} />}
          {active === "history" && <ManagerAdminHistory api={api} />}
          {active === "dashboard" && <SuperAdminDashboard api={api} />}
          {active === "kb" && <KnowledgeBaseAdmin api={api} session={session} />}
          {active === "users" && <UserManagement api={api} />}
          {active === "prompts" && <PromptAndModelSettings api={api} />}
          {active === "audit" && <AuditCenter api={api} />}
          {active === "embed" && <EmbedPreview api={api} />}
        </section>
      </main>
    </div>
  );
}
