import { ArrowRight, Building2, Search, Sparkles, UserCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { User } from "../shared";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { EmptyState } from "./EmptyState";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  api: ApiClient;
  session: Session;
  onSession: (session: Session) => void;
}

export function FirstVisitManagerSelection({ api, session, onSession }: Props) {
  const [managers, setManagers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ managers?: User[] }>("/managers/active")
      .then((payload) => setManagers(payload?.managers ?? []))
      .catch(() => setManagers([]));
  }, [api]);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return managers;
    return managers.filter(
      (manager) =>
        manager.name.toLowerCase().includes(lower) ||
        manager.department?.toLowerCase().includes(lower) ||
        manager.email.toLowerCase().includes(lower),
    );
  }, [managers, query]);

  async function confirm() {
    if (!selected) return;
    setLoading(true);
    try {
      const payload = await api.post<{ user: User }>("/auth/first-visit/manager", {
        managerId: selected,
      });
      toast.success("Manager rattaché", {
        description: "Votre compte consultant est maintenant actif.",
      });
      onSession({ ...session, user: payload.user });
    } catch (err) {
      toast.error("Impossible de rattacher le manager", {
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-background">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-center gap-3"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">MIGSO-PCUBED</p>
            <p className="text-xs text-muted-foreground">Finalisation du compte consultant</p>
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft lg:p-8"
        >
          <div className="mb-6 flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Choisissez votre manager
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                En tant que consultant, vous devez rattacher votre compte à un manager. Cette
                association conditionne la visibilité de vos échanges, les escalades humaines et le
                périmètre des rapports.
              </p>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Rechercher par nom, email ou département"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {filtered.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((manager) => {
                const isSelected = selected === manager.id;
                return (
                  <button
                    key={manager.id}
                    type="button"
                    onClick={() => setSelected(manager.id)}
                    className={`group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-soft ${
                      isSelected ? "border-primary/60 bg-primary/5 shadow-soft" : "border-border/70"
                    }`}
                  >
                    <div
                      className={`grid size-9 shrink-0 place-items-center rounded-lg transition ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                      }`}
                    >
                      <UserCheck className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{manager.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Building2 className="size-3" />
                        {manager.department ?? "Département non précisé"}
                      </p>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {manager.email}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Aucun manager disponible"
              description="Aucun manager actif ne correspond à votre recherche. Contactez votre super admin pour activer un manager."
              icon={<Users size={18} />}
            />
          )}

          <div className="mt-6 flex flex-col-reverse items-stretch gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Vous pourrez changer de manager ultérieurement depuis vos paramètres de compte.
            </p>
            <Button
              onClick={() => void confirm()}
              disabled={!selected || loading}
              className="h-11 gap-2"
            >
              {loading ? "Enregistrement…" : "Confirmer le rattachement"}
              {!loading && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
