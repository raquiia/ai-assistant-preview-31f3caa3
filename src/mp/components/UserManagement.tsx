import { UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "../shared";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { DashboardCards } from "./DashboardCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ROLE_LABEL: Record<User["role"], string> = {
  CONSULTANT: "Consultant",
  MANAGER: "Manager",
  SUPER_ADMIN: "Super admin",
  AUDITOR: "Auditeur",
};

function roleVariant(role: User["role"]): "default" | "secondary" | "outline" | "destructive" {
  if (role === "SUPER_ADMIN") return "destructive";
  if (role === "MANAGER") return "default";
  if (role === "AUDITOR") return "secondary";
  return "outline";
}

export function UserManagement({ api }: { api: ApiClient }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<User["role"]>("CONSULTANT");

  async function refresh() {
    const payload = await api.get<{ users: User[] }>("/superadmin/users");
    setUsers(payload.users);
  }

  useEffect(() => {
    refresh().catch(() => setUsers([]));
  }, []);

  async function create() {
    if (!email || !name) {
      toast.error("Renseignez le nom et l'email.");
      return;
    }
    await api.post("/superadmin/users", {
      email,
      name,
      role,
      language: "fr",
      status: "ACTIVE",
    });
    setEmail("");
    setName("");
    toast.success("Utilisateur créé.");
    await refresh();
  }

  const counts = useMemo(
    () => ({
      consultants: users.filter((user) => user.role === "CONSULTANT").length,
      managers: users.filter((user) => user.role === "MANAGER").length,
      auditors: users.filter((user) => user.role === "AUDITOR").length,
      superAdmins: users.filter((user) => user.role === "SUPER_ADMIN").length,
    }),
    [users],
  );

  return (
    <AdminLayout
      title="Utilisateurs & rôles"
      description="Gérez les accès, attribuez les rôles métiers et consultez la répartition de l'équipe."
    >
      <DashboardCards
        cards={[
          { label: "Consultants", value: counts.consultants, tone: "primary" },
          { label: "Managers", value: counts.managers, tone: "success" },
          { label: "Auditeurs", value: counts.auditors, tone: "warning" },
          { label: "Super admins", value: counts.superAdmins, tone: "destructive" },
        ]}
      />

      <section className="mt-6 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserPlus size={15} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Créer un utilisateur</p>
            <p className="text-xs text-muted-foreground">
              Les comptes apparaissent immédiatement dans le tableau ci-dessous.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[180px_1fr_1fr_auto]">
          <Select value={role} onValueChange={(value) => setRole(value as User["role"])}>
            <SelectTrigger>
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABEL) as User["role"][]).map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Nom complet"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            placeholder="email@migso-pcubed.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button onClick={() => void create()} className="gap-2">
            <UserPlus size={15} />
            Créer
          </Button>
        </div>
      </section>

      <div className="mt-6">
        {users.length ? (
          <DataTable
            rows={users}
            columns={[
              {
                key: "name",
                header: "Nom",
                render: (row) => <span className="font-medium text-foreground">{row.name}</span>,
              },
              {
                key: "email",
                header: "Email",
                render: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">{row.email}</span>
                ),
              },
              {
                key: "role",
                header: "Rôle",
                render: (row) => (
                  <Badge variant={roleVariant(row.role)} className="rounded-full">
                    {ROLE_LABEL[row.role]}
                  </Badge>
                ),
              },
              {
                key: "managerId",
                header: "Manager",
                render: (row) => (
                  <span className="text-muted-foreground">{row.managerId ?? "—"}</span>
                ),
              },
              {
                key: "status",
                header: "Statut",
                render: (row) => (
                  <Badge
                    variant={row.status === "ACTIVE" ? "default" : "secondary"}
                    className="rounded-full"
                  >
                    {row.status}
                  </Badge>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="Aucun utilisateur"
            description="Créez les comptes de développement puis ajoutez les utilisateurs métiers réels au fil du déploiement."
            icon={<UserPlus size={18} />}
          />
        )}
      </div>
    </AdminLayout>
  );
}
