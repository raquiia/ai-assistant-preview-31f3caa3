import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, LogOut, RefreshCw, Sparkles, UserCheck } from "lucide-react";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import type { User } from "../shared";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { toast } from "sonner";

interface Props {
  api: ApiClient;
  session: Session;
  onSession: (session: Session) => void;
  onLogout: () => void;
}

export function PendingApprovalScreen({ api, session, onSession, onLogout }: Props) {
  const [manager, setManager] = useState<User | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!session.user.managerId) return;
    api
      .get<{ managers?: User[] }>("/managers/active")
      .then((p) => {
        const m = (p.managers ?? []).find((mm) => mm.id === session.user.managerId);
        if (m) setManager(m);
      })
      .catch(() => undefined);
  }, [api, session.user.managerId]);

  async function refresh() {
    setRefreshing(true);
    try {
      const payload = await api.get<{ user: User }>("/auth/me");
      if (payload.user.status === "ACTIVE") {
        onSession({ ...session, user: payload.user });
        toast.success("Compte approuvé", { description: "Bienvenue dans la plateforme." });
      } else if (payload.user.status === "DISABLED") {
        toast.error("Demande refusée", {
          description: "Votre manager a refusé la demande. Contactez le super admin.",
        });
      } else {
        toast("Toujours en attente", {
          description: "Votre manager n'a pas encore traité la demande.",
        });
      }
    } catch (err) {
      toast.error("Vérification impossible", {
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-background">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1.5">
          <LogOut className="size-4" /> Déconnexion
        </Button>
      </div>

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-soft"
        >
          <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Clock className="size-6" />
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            En attente d'approbation
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Bonjour {session.user.name.split(" ")[0]}, votre demande de rattachement a bien été envoyée.
            Votre manager doit valider votre compte avant que vous puissiez accéder à l'assistant.
          </p>

          {manager && (
            <div className="mx-auto mt-6 flex max-w-sm items-center gap-3 rounded-xl border border-border bg-muted/30 p-4 text-left">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <UserCheck className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Manager en attente</p>
                <p className="truncate text-sm font-medium">{manager.name}</p>
                <p className="truncate text-xs text-muted-foreground">{manager.email}</p>
              </div>
            </div>
          )}

          <Button onClick={() => void refresh()} disabled={refreshing} className="mt-6 gap-2">
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Vérifier le statut
          </Button>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="size-3" />
            Vous recevrez un email dès que votre compte sera activé.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
