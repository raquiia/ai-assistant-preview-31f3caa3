import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { branding } from "../branding";
import { useState, type FormEvent } from "react";
import { ApiClient } from "../api";
import type { Session } from "../types";

interface Props {
  onLogin: (session: Session) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("consultant1@migso-pcubed.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const api = new ApiClient(() => null);
      const session = await api.post<Session>("/auth/login", { email, password });
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#eef4f9] lg:grid-cols-[minmax(0,1.15fr)_460px]">
      <section className="flex flex-col justify-between border-b border-slate-200 bg-mp-navy p-6 text-white lg:border-b-0 lg:border-r lg:p-10">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-mp bg-white text-mp-navy shadow-sm">
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{branding.companyName}</p>
            <p className="truncate text-sm text-cyan-100">{branding.productName}</p>
          </div>
        </div>

        <div className="max-w-3xl py-10 lg:py-0">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight lg:text-5xl">Plateforme IA interne pour consultants, managers et gouvernance métier</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200">
            Chat sourcé, historique admin, revue de connaissances, prompt editor versionné et intégrations prêtes pour une migration AWS sans rework visuel.
          </p>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              "Réponses sourcées et explicites",
              "Rôles, audit et conformité",
              "Architecture local-first prête pour AWS"
            ].map((item) => (
              <div key={item} className="rounded-mp border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium leading-6 text-white">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-cyan-100">Comptes de développement uniquement. Les états vides restent visibles tant que les données réelles ne sont pas là.</p>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-mp border border-slate-200 bg-white p-6 shadow-panel">
          <div className="mb-6">
            <p className="text-2xl font-semibold tracking-tight text-slate-950">Connexion</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Entrez avec un compte de développement pour parcourir l'interface produit.</p>
          </div>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
            <span className="flex h-11 items-center gap-2 rounded-mp border border-slate-200 bg-white px-3">
              <Mail size={17} className="text-slate-400" />
              <input className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" value={email} onChange={(event) => setEmail(event.target.value)} />
            </span>
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Mot de passe</span>
            <span className="flex h-11 items-center gap-2 rounded-mp border border-slate-200 bg-white px-3">
              <LockKeyhole size={17} className="text-slate-400" />
              <input className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </span>
          </label>

          {error && <p className="mb-3 rounded-mp border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button className="h-11 w-full rounded-mp bg-mp-blue text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>

          <div className="mt-5 rounded-mp border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
              <ShieldCheck size={16} className="text-mp-blue" />
              Comptes disponibles
            </div>
            <p className="mp-text-wrap">superadmin@migso-pcubed.local, manager.a@migso-pcubed.local, consultant1@migso-pcubed.local, auditor@migso-pcubed.local</p>
          </div>
        </form>
      </section>
    </main>
  );
}
