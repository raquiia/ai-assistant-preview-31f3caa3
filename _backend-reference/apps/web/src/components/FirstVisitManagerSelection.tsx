import { Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@mp/shared";
import type { ApiClient } from "../api.js";
import type { Session } from "../types.js";
import { EmptyState } from "./EmptyState.js";

interface Props {
  api: ApiClient;
  session: Session;
  onSession: (session: Session) => void;
}

export function FirstVisitManagerSelection({ api, session, onSession }: Props) {
  const [managers, setManagers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ managers: User[] }>("/managers/active").then((payload) => setManagers(payload.managers)).catch(() => setManagers([]));
  }, [api]);

  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return managers.filter((manager) => manager.name.toLowerCase().includes(lower) || manager.department?.toLowerCase().includes(lower));
  }, [managers, query]);

  async function confirm() {
    if (!selected) return;
    const payload = await api.post<{ user: User }>("/auth/first-visit/manager", { managerId: selected });
    onSession({ ...session, user: payload.user });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef4f9] p-4 sm:p-6">
      <section className="w-full max-w-4xl rounded-mp border border-slate-200 bg-white p-6 shadow-panel lg:p-8">
        <div className="mb-5">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-mp bg-blue-50 text-mp-blue">
            <Users size={20} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Choisissez votre manager</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Cette association conditionne la visibilité des échanges, les escalades humaines et la portée des rapports.</p>
        </div>

        <label className="mb-4 flex h-11 items-center gap-2 rounded-mp border border-slate-200 px-3">
          <Search size={17} className="text-slate-400" />
          <input className="min-w-0 flex-1 border-0 outline-none" placeholder="Rechercher un manager" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>

        {filtered.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((manager) => (
              <button
                key={manager.id}
                className={`rounded-mp border p-4 text-left transition ${
                  selected === manager.id ? "border-mp-blue bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                onClick={() => setSelected(manager.id)}
              >
                <p className="font-medium text-slate-950">{manager.name}</p>
                <p className="mt-1 text-sm text-slate-500">{manager.department}</p>
                <p className="mt-2 text-xs text-slate-500">{manager.language.toUpperCase()}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aucun manager actif"
            description="Ajoutez au moins un manager actif pour rattacher votre compte consultant."
            icon={<Users size={18} />}
          />
        )}

        <div className="mt-5 flex justify-end">
          <button className="h-10 rounded-mp bg-mp-blue px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50" disabled={!selected} onClick={() => void confirm()}>
            Confirmer
          </button>
        </div>
      </section>
    </main>
  );
}
