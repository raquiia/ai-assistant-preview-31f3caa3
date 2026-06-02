import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { API_URL } from "../api.js";
import type { ApiClient } from "../api.js";
import { AdminLayout } from "./AdminLayout.js";
import { EmptyState } from "./EmptyState.js";

export function EmbedPreview({ api }: { api: ApiClient }) {
  const [token, setToken] = useState("");
  const snippet = useMemo(
    () => `<iframe src="${API_URL}/embed/chat?tenant=mp&theme=default" title="MIGSO-PCUBED AI Assistant" style="width:420px;height:640px;border:0;border-radius:8px"></iframe>`,
    []
  );

  async function createToken() {
    const payload = await api.post<{ token: string }>("/embed/token", { subject: "demo-embed" });
    setToken(payload.token);
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <AdminLayout
      title="Preview iframe et integration"
      actions={
        <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white shadow-sm" onClick={() => void createToken()}>
          <KeyRound size={16} />
          Generer un token
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Snippet iframe</p>
              <p className="text-xs text-slate-500">Utilisez un token court et des origines autorisées.</p>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-mp border border-slate-200 hover:bg-slate-50" onClick={() => void copy(snippet)} title="Copier le snippet">
              <Copy size={15} />
            </button>
          </div>
          <pre className="mp-scrollbar overflow-x-auto rounded-mp bg-slate-950 p-4 text-xs leading-5 text-white">{snippet}</pre>
          {token ? (
            <>
              <p className="mb-2 mt-4 text-sm font-semibold text-slate-950">Embed token</p>
              <code className="block break-all rounded-mp bg-slate-100 p-3 text-xs text-slate-700">{token}</code>
            </>
          ) : (
            <EmptyState
              title="Aucun token"
              description="Générez un token si vous devez prévisualiser ou tester l'intégration dans une autre application."
              icon={<ShieldCheck size={16} />}
            />
          )}
        </section>
        <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={18} className="text-mp-blue" />
            <div>
              <p className="text-sm font-semibold text-slate-950">Preview embarquée</p>
              <p className="text-xs text-slate-500">L'iframe reste isolée et prête pour un usage produit.</p>
            </div>
          </div>
          <iframe src={`${API_URL}/embed/chat?tenant=mp&theme=default`} title="MIGSO-PCUBED AI Assistant" className="h-[640px] w-full rounded-mp border border-slate-200 bg-white" />
        </section>
      </div>
    </AdminLayout>
  );
}
