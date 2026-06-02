import { useMemo } from "react";
import { useAuth } from "./auth";
import { AppShell, type ShellViewMeta } from "@/components/layout/AppShell";
import { AuditCenter } from "./components/AuditCenter";
import { ChatShell } from "./components/ChatShell";
import { ConsultantApprovals } from "./components/ConsultantApprovals";
import { EmbedPreview } from "./components/EmbedPreview";
import { FirstVisitManagerSelection } from "./components/FirstVisitManagerSelection";
import { KnowledgeBaseAdmin } from "./components/KnowledgeBaseAdmin";
import { LoginPage } from "./components/LoginPage";
import { ManagerAdminHistory } from "./components/ManagerAdminHistory";
import { PendingApprovalScreen } from "./components/PendingApprovalScreen";
import { PromptAndModelSettings } from "./components/PromptAndModelSettings";
import { SuperAdminDashboard } from "./components/SuperAdminDashboard";
import { UsageDashboard } from "./components/UsageDashboard";
import { ModelSelector } from "./components/ModelSelector";
import { UserManagement } from "./components/UserManagement";
import type { Role } from "./shared";
import type { ViewKey } from "./types";

function MpAppInner() {
  const { session, hydrated, api, setSession, logout } = useAuth();

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="size-8 animate-pulse rounded-full bg-primary/30" />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  if (session.user.role === "CONSULTANT" && session.user.status === "PENDING_MANAGER") {
    // Consultant ayant déjà choisi son manager → écran d'attente d'approbation
    if (session.user.managerId) {
      return (
        <PendingApprovalScreen
          api={api}
          session={session}
          onSession={setSession}
          onLogout={logout}
        />
      );
    }
    // Consultant n'ayant pas encore choisi son manager (legacy first-visit)
    return <FirstVisitManagerSelection api={api} session={session} onSession={setSession} />;
  }


  const allViews = useMemo<Array<ShellViewMeta & { roles: Role[] }>>(() => [
    {
      key: "chat",
      title: "Chat assistant",
      subtitle: "Conversation sourcée, citations explicites",
      roles: ["CONSULTANT", "MANAGER", "SUPER_ADMIN"],
      actions: <ModelSelector api={api} compact />,
      content: <ChatShell api={api} session={session} />,
    },
    {
      key: "history",
      title: "Historique Q/R",
      subtitle: "Revue des conversations passées",
      roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"],
      content: <ManagerAdminHistory api={api} />,
    },
    {
      key: "dashboard",
      title: "Dashboard",
      subtitle: "KPI usage, latence, coûts",
      roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"],
      content: <SuperAdminDashboard api={api} />,
    },
    {
      key: "usage",
      title: "Budget & coûts",
      subtitle: "Jauge mensuelle, tokens, modèles, ventilation par org.",
      roles: ["CONSULTANT", "MANAGER", "SUPER_ADMIN", "AUDITOR"],
      content: <UsageDashboard api={api} />,
    },
    {
      key: "kb",
      title: "Knowledge Base",
      subtitle: "Gestion documentaire, ingestion, revue",
      roles: ["MANAGER", "SUPER_ADMIN", "AUDITOR"],
      content: <KnowledgeBaseAdmin api={api} session={session} />,
    },
    {
      key: "approvals",
      title: "Approbations",
      subtitle: "Valider les nouveaux consultants rattachés à votre périmètre",
      roles: ["MANAGER", "SUPER_ADMIN"],
      content: <ConsultantApprovals api={api} />,
    },
    {
      key: "users",
      title: "Utilisateurs",
      subtitle: "Rôles, statut, départements",
      roles: ["SUPER_ADMIN"],
      content: <UserManagement api={api} />,
    },
    {
      key: "prompts",
      title: "Prompts & modèles",
      subtitle: "Versions, providers, paramètres IA",
      roles: ["SUPER_ADMIN"],
      content: <PromptAndModelSettings api={api} />,
    },
    {
      key: "audit",
      title: "Audit",
      subtitle: "Traçabilité complète des actions",
      roles: ["SUPER_ADMIN", "AUDITOR"],
      content: <AuditCenter api={api} />,
    },
    {
      key: "embed",
      title: "Embed",
      subtitle: "Intégration externe et widgets",
      roles: ["SUPER_ADMIN"],
      content: <EmbedPreview api={api} />,
    },
  ], [api, session]);

  const accessibleViews = allViews.filter((v) => v.roles.includes(session.user.role));
  const initial: ViewKey = accessibleViews[0]?.key ?? "chat";

  return <AppShell views={accessibleViews} initialView={initial} />;
}

export function MpApp() {
  return <MpAppInner />;
}
