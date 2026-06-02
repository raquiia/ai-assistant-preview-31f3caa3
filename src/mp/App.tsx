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
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { branding } from "./branding";
import type { Role } from "./shared";
import { ApiClient } from "./api";
import { AuditCenter } from "./components/AuditCenter";
import { ChatShell } from "./components/ChatShell";
import { EmbedPreview } from "./components/EmbedPreview";
import { FirstVisitManagerSelection } from "./components/FirstVisitManagerSelection";
import { KnowledgeBaseAdmin } from "./components/KnowledgeBaseAdmin";
import { LoginPage } from "./components/LoginPage";
import { ManagerAdminHistory } from "./components/ManagerAdminHistory";
import { PromptAndModelSettings } from "./components/PromptAndModelSettings";
import { SuperAdminDashboard } from "./components/SuperAdminDashboard";
import { UserManagement } from "./components/UserManagement";
import type { Session, ViewKey } from "./types";

const nav: Array<{ key: ViewKey; label: string; icon: typeof Bot; roles: Role[] }> = [
  { key: "chat", label: "Chat", icon: MessageSquareText, roles: ["CONSULTANT", "MANAGER", "SUPER_ADMIN"] },
  { key: "history", label: "Historique Q/R", icon: History, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"] },
  { key: "dashboard", label: "Dashboard", icon: Gauge, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"] },
  { key: "kb", label: "Knowledge Base", icon: Database, roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"] },
  { key: "users", label: "Utilisateurs", icon: Users, roles: ["SUPER_ADMIN"] },
  { key: "prompts", label: "Prompts & modeles", icon: KeyRound, roles: ["SUPER_ADMIN"] },
  { key: "audit", label: "Audit", icon: ShieldCheck, roles: ["SUPER_ADMIN", "AUDITOR"] },
  { key: "embed", label: "Embed", icon: ClipboardCheck, roles: ["SUPER_ADMIN"] },
];

const SESSION_KEY = "mp-session";
const NAV_KEY = "mp-nav-collapsed";

function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(SESSION_KEY);
  return stored ? (JSON.parse(stored) as Session) : null;
}

export function MpApp() {
  const [session, setSession] = useState<Session | null>(readStoredSession);
  const [navCollapsed, setNavCollapsed] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem(NAV_KEY) === "true",
  );
  const [view, setView] = useState<ViewKey>("chat");
  const api = useMemo(() => new ApiClient(() => session), [session]);

  function handleSession(next: Session | null) {
    setSession(next);
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_KEY);
  }

  if (!session) return <LoginPage onLogin={handleSession} />;

  if (session.user.role === "CONSULTANT" && session.user.status === "PENDING_MANAGER") {
    return <FirstVisitManagerSelection api={api} session={session} onSession={handleSession} />;
  }

  const items = nav.filter((item) => item.roles.includes(session.user.role));
  const active = items.some((item) => item.key === view) ? view : items[0]!.key;
  const activeItem = items.find((item) => item.key === active) ?? items[0]!;

  function toggleSidebar() {
    setNavCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") window.localStorage.setItem(NAV_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <aside
        className={`hidden shrink-0 border-r border-slate-200 bg-mp-navy text-white transition-[width] duration-200 lg:flex lg:flex-col ${
          navCollapsed ? "w-[88px]" : "w-72"
        }`}
      >
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
          <div className={`mb-3 rounded-mp bg-white/10 p-3 ${navCollapsed ? "text-center" : ""}`}>
            {navCollapsed ? (
              <div className="grid h-10 w-10 place-items-center rounded-mp bg-white/10 text-white">
                <UserRound size={18} />
              </div>
            ) : (
              <p className="truncate text-sm font-medium">{session.user.name}</p>
            )}
            {!navCollapsed && <p className="truncate text-xs text-cyan-100">{session.user.role}</p>}
          </div>
          <button
            className="flex h-10 w-full items-center rounded-mp text-sm text-slate-200 hover:bg-white/10"
            title="Deconnexion"
            onClick={() => handleSession(null)}
          >
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
            <button
              className="hidden h-10 w-10 items-center justify-center rounded-mp border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:inline-flex"
              title={navCollapsed ? "Ouvrir le menu" : "Réduire le menu"}
              onClick={toggleSidebar}
            >
              {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <select
              className="h-10 rounded-mp border border-slate-200 bg-white px-3 text-sm lg:hidden"
              value={active}
              onChange={(event) => setView(event.target.value as ViewKey)}
            >
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
