import { ArrowRight, Building2, LockKeyhole, Mail, Shield, Sparkles, User as UserIcon, UserCheck, Zap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ApiClient } from "../api";
import { useAuth } from "../auth";
import { authProvider, AUTH_MODE } from "../auth/index";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { User } from "../shared";
import type { Session } from "../types";

const demoAccounts = [
  { email: "superadmin@migso-pcubed.local", role: "Super Admin", color: "from-violet-500 to-fuchsia-500" },
  { email: "manager.a@migso-pcubed.local", role: "Manager", color: "from-blue-500 to-cyan-500" },
  { email: "consultant1@migso-pcubed.local", role: "Consultant", color: "from-emerald-500 to-teal-500" },
  { email: "auditor@migso-pcubed.local", role: "Auditeur", color: "from-amber-500 to-orange-500" },
];

type Mode = "signin" | "signup";

export function LoginPage() {
  const { setSession } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("consultant1@migso-pcubed.local");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);

  // Sign-up state
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [managers, setManagers] = useState<User[]>([]);
  const [managerId, setManagerId] = useState<string>("");

  useEffect(() => {
    if (mode !== "signup") return;
    const api = new ApiClient(() => null);
    api
      .get<{ managers?: User[] }>("/managers/active")
      .then((p) => setManagers(p?.managers ?? []))
      .catch(() => setManagers([]));
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const session = await authProvider.signIn(email, password);
      setSession(session);
      toast.success("Connexion réussie", { description: `Bienvenue ${session.user.name}` });
    } catch (err) {
      toast.error("Connexion impossible", {
        description: err instanceof Error ? err.message : "Une erreur est survenue",
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitSignup(event: FormEvent) {
    event.preventDefault();
    if (!managerId) {
      toast.error("Choisissez votre manager dans la liste");
      return;
    }
    setLoading(true);
    try {
      const api = new ApiClient(() => null);
      const session = await api.post<Session>("/auth/register", {
        name,
        email: signupEmail,
        password: signupPassword,
        managerId,
        department: department || undefined,
      });
      setSession(session);
      toast.success("Compte créé", {
        description: `Bienvenue ${session.user.name}, votre manager est rattaché.`,
      });
    } catch (err) {
      toast.error("Création de compte impossible", {
        description: err instanceof Error ? err.message : "Une erreur est survenue",
      });
    } finally {
      setLoading(false);
    }
  }


  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Visual side */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 lg:flex lg:flex-col lg:justify-between lg:p-12 lg:text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.18),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold">MIGSO-PCUBED</p>
            <p className="text-xs text-white/60">AI Assistant · v2.0</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative z-10 max-w-xl"
        >
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-400 pulse-dot" /> Plateforme interne · 2026
          </p>
          <h2 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            L'intelligence métier{" "}
            <span className="bg-gradient-to-r from-blue-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">
              au service du PMO
            </span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
            Chat sourcé, knowledge base, audit et gouvernance. Une seule interface pour vos consultants, managers et équipes conformité.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Sparkles, label: "Réponses sourcées" },
              { icon: Shield, label: "Audit complet" },
              { icon: Zap, label: "AWS ready" },
            ].map(({ icon: Icon, label }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur"
              >
                <Icon className="mb-2 size-4 text-blue-300" />
                <p className="text-xs font-medium text-white/80">{label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <p className="relative z-10 text-xs text-white/40">© 2026 MIGSO-PCUBED · Tous droits réservés</p>
      </aside>

      {/* Form side */}
      <section className="relative flex flex-col">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <p className="font-display text-base font-semibold">MIGSO-PCUBED</p>
              </div>
            </div>

            <div className="mb-6">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {mode === "signin" ? "Bon retour" : "Créer un compte consultant"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Connectez-vous avec votre compte pour explorer l'interface."
                  : "Renseignez vos informations et choisissez votre manager pour activer votre accès."}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="mb-6 inline-flex w-full rounded-xl border border-border bg-muted/40 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-lg px-3 py-2 font-medium transition ${
                  mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-lg px-3 py-2 font-medium transition ${
                  mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Créer un compte
              </button>
            </div>

            <AnimatePresence mode="wait">
              {mode === "signin" ? (
                <motion.form
                  key="signin"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={submit}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="email">Email professionnel</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="vous@migso-pcubed.local"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Mot de passe</Label>
                      <button type="button" className="text-xs text-muted-foreground transition hover:text-primary">
                        Mot de passe oublié ?
                      </button>
                    </div>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="h-11 w-full text-sm font-medium shadow-glow">
                    {loading ? "Connexion en cours…" : (
                      <>Se connecter <ArrowRight className="ml-1 size-4" /></>
                    )}
                  </Button>

                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button type="button" onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">
                      Créez votre compte consultant
                    </button>
                  </p>
                </motion.form>
              ) : (
                <motion.form
                  key="signup"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={submitSignup}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom complet</Label>
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="Prénom Nom"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email professionnel</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="vous@migso-pcubed.local"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Mot de passe</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="6 caractères minimum"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="department">Département (optionnel)</Label>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="department"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="h-11 pl-9"
                        placeholder="Aerospace, Automotive…"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Votre manager</Label>
                    {managers.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                        Chargement des managers… Si la liste reste vide, contactez votre super admin.
                      </p>
                    ) : (
                      <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                        {managers.map((mgr) => {
                          const sel = managerId === mgr.id;
                          return (
                            <button
                              key={mgr.id}
                              type="button"
                              onClick={() => setManagerId(mgr.id)}
                              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/40 ${
                                sel ? "border-primary/60 bg-primary/5 shadow-soft" : "border-border"
                              }`}
                            >
                              <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${sel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                <UserCheck className="size-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{mgr.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {mgr.department ?? "—"} · {mgr.email}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button type="submit" disabled={loading || !managerId} className="h-11 w-full text-sm font-medium shadow-glow">
                    {loading ? "Création en cours…" : (
                      <>Créer mon compte <ArrowRight className="ml-1 size-4" /></>
                    )}
                  </Button>

                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    Déjà un compte ?{" "}
                    <button type="button" onClick={() => setMode("signin")} className="font-medium text-primary hover:underline">
                      Connectez-vous
                    </button>
                  </p>
                </motion.form>
              )}
            </AnimatePresence>

            {mode === "signin" && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Comptes démo</p>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="grid gap-2">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => setEmail(acc.email)}
                      className={`group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-soft ${
                        email === acc.email ? "border-primary/40 shadow-soft" : ""
                      }`}
                    >
                      <div className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${acc.color} text-white shadow-sm`}>
                        <span className="text-xs font-semibold">{acc.role[0]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{acc.role}</p>
                        <p className="truncate text-xs text-muted-foreground">{acc.email}</p>
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </>
            )}

          </motion.div>
        </div>
      </section>
    </main>
  );
}
