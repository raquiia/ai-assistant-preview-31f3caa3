import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Check, Mail, RefreshCw, UserCheck, UserX, X } from "lucide-react";
import type { ApiClient } from "../api";
import type { User } from "../shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { EmptyState } from "./EmptyState";

interface Props {
  api: ApiClient;
}

export function ConsultantApprovals({ api }: Props) {
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.get<{ consultants: User[] }>("/managers/me/pending-consultants");
      setItems(payload.consultants ?? []);
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await api.post(`/managers/consultants/${id}/${action}`);
      setItems((prev) => prev.filter((u) => u.id !== id));
      toast.success(
        action === "approve" ? "Consultant approuvé" : "Demande refusée",
        {
          description:
            action === "approve"
              ? "Son compte est désormais actif."
              : "Le compte a été désactivé.",
        },
      );
    } catch (err) {
      toast.error("Action impossible", {
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Demandes de rattachement
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Approuvez ou refusez les nouveaux consultants qui vous ont sélectionné comme manager.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </div>

        {loading && items.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-muted/30" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Aucune demande en attente"
            description="Toutes les demandes ont été traitées. Vous serez notifié dès qu'un nouveau consultant vous sélectionnera."
            icon={<UserCheck size={18} />}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {items.map((u) => (
                <motion.article
                  key={u.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <UserCheck className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {u.email}
                        </p>
                        {u.department && (
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <Building2 className="size-3" />
                            {u.department}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">En attente</Badge>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busyId === u.id}
                      onClick={() => void decide(u.id, "reject")}
                    >
                      <X className="size-4" /> Refuser
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={busyId === u.id}
                      onClick={() => void decide(u.id, "approve")}
                    >
                      <Check className="size-4" /> Approuver
                    </Button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <UserX className="size-3.5" />
          Un refus désactive le compte. Le consultant pourra contacter son super admin pour réessayer.
        </p>
      </div>
    </div>
  );
}
