import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { API_URL } from "../api";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function EmbedPreview({ api }: { api: ApiClient }) {
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(
    () =>
      `<iframe src="${API_URL}/embed/chat?tenant=mp&theme=default" title="MIGSO-PCUBED AI Assistant" style="width:420px;height:640px;border:0;border-radius:12px"></iframe>`,
    [],
  );

  async function createToken() {
    const payload = await api.post<{ token: string }>("/embed/token", { subject: "demo-embed" });
    setToken(payload.token);
    toast.success("Token généré");
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AdminLayout
      title="Preview iframe & intégration"
      description="Snippet, token de démo et aperçu temps réel de l'iframe embarquable."
      actions={
        <Button onClick={() => void createToken()} className="gap-2">
          <KeyRound size={15} />
          Générer un token
        </Button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]">
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-base font-semibold text-foreground">Snippet iframe</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Utilisez un token court et des origines autorisées.
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void copy(snippet)}
              title="Copier le snippet"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </div>
          <pre className="mp-scrollbar overflow-x-auto rounded-xl bg-foreground/95 p-4 font-mono text-xs leading-relaxed text-background">
            {snippet}
          </pre>
          {token ? (
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Embed token
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/40 p-3">
                <code className="block flex-1 break-all font-mono text-xs text-foreground/80">
                  {token}
                </code>
                <Button variant="ghost" size="icon" onClick={() => void copy(token)}>
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                title="Aucun token actif"
                description="Générez un token si vous devez prévisualiser ou tester l'intégration dans une autre application."
                icon={<ShieldCheck size={16} />}
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                Preview embarquée
              </p>
              <p className="text-xs text-muted-foreground">
                L'iframe reste isolée et prête pour un usage produit.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/50 bg-background">
            <iframe
              src={`${API_URL}/embed/chat?tenant=mp&theme=default`}
              title="MIGSO-PCUBED AI Assistant"
              className="h-[640px] w-full"
            />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
