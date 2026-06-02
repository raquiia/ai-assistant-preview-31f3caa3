import { UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "../shared";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";

export function UserManagement({ api }: { api: ApiClient }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<User["role"]>("CONSULTANT");
  const [status, setStatus] = useState("");

  async function refresh() {
    const payload = await api.get<{ users: User[] }>("/superadmin/users");
    setUsers(payload.users);
  }

  useEffect(() => {
    refresh().catch(() => setUsers([]));
  }, []);

  async function create() {
    if (!email || !name) return;
    await api.post("/superadmin/users", { email, name, role, language: "fr", status: "ACTIVE" });
    setEmail("");
    setName("");
    setStatus("Utilisateur créé.");
    await refresh();
  }

  const counts = useMemo(
    () => ({
      consultants: users.filter((user) => user.role === "CONSULTANT").length,
      managers: users.filter((user) => user.role === "MANAGER").length,
      auditors: users.filter((user) => user.role === "AUDITOR").length,
      superAdmins: users.filter((user) => user.role === "SUPER_ADMIN").length
    }),
    [users]
  );

  return (
    <AdminLayout
      title="Utilisateurs et rôles"
      actions={
        <div className="grid gap-2 lg:grid-cols-[160px_1fr_1fr_auto]">
          <select className="h-10 rounded-mp border border-slate-200 px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as User["role"])}>
            {["CONSULTANT", "MANAGER", "SUPER_ADMIN", "AUDITOR"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input className="h-10 rounded-mp border border-slate-200 px-3 text-sm" placeholder="Nom" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="h-10 rounded-mp border border-slate-200 px-3 text-sm" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white shadow-sm" onClick={() => void create()}>
            <UserPlus size={16} />
            Creer
          </button>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <CountCard label="Consultants" value={counts.consultants} />
        <CountCard label="Managers" value={counts.managers} />
        <CountCard label="Auditeurs" value={counts.auditors} />
        <CountCard label="Super admins" value={counts.superAdmins} />
      </div>
      {status && <p className="mb-4 rounded-mp border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700">{status}</p>}
      {users.length ? (
        <DataTable
          rows={users}
          columns={[
            { key: "name", header: "Nom" },
            { key: "email", header: "Email" },
            { key: "role", header: "Role" },
            { key: "managerId", header: "Manager", render: (row) => row.managerId ?? "Aucun" },
            { key: "status", header: "Statut" }
          ]}
        />
      ) : (
        <EmptyState
          title="Aucun utilisateur"
          description="Créez les comptes de développement puis ajoutez les utilisateurs métiers réels au fil du déploiement."
          icon={<UserPlus size={18} />}
        />
      )}
    </AdminLayout>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
