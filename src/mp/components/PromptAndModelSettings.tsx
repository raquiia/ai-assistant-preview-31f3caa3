import {
  AlertTriangle,
  Beaker,
  Cpu,
  Database,
  FileText,
  Gauge,
  Globe,
  KeyRound,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AiProviderConfig, AppSettings, PromptVersion, Role } from "../shared";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Tone = "professional" | "consultative" | "concise" | "directive";
type PromptStatus = "DRAFT" | "REVIEW" | "APPROVED" | "ACTIVE";

interface FewShotExample {
  id: string;
  question: string;
  answer: string;
}

interface PromptDraft {
  name: string;
  baseInstruction: string;
  tone: Tone;
  webSearchEnabled: boolean;
  sourcePolicy: string;
  codeOfConduct: string;
  escalationPolicy: string;
  sourceCitationPolicy: string;
  languagePolicy: string;
  responseStructure: string;
  // Variables & few-shot
  fewShot: FewShotExample[];
  // Ciblage & cycle de vie
  targetRoles: Role[];
  targetDepartments: string[];
  canaryPercent: number;
  effectiveAt: string;
  changelog: string;
  status: PromptStatus;
}

interface CorrectionItem {
  id: string;
  title: string;
  content: string;
  status: "DRAFT" | "APPROVED" | "ACTIVE" | "REJECTED";
  createdAt: string;
  activatedAt?: string | null;
  approvedBy: { id: string; name: string; role: string } | null;
  adminComment: {
    id: string;
    comment: string;
    createdAt: string;
    status: "DRAFT" | "APPROVED" | "ACTIVE" | "REJECTED";
  } | null;
}

const AVAILABLE_VARIABLES = [
  { key: "{{user.name}}", desc: "Nom complet de l'utilisateur courant" },
  { key: "{{user.role}}", desc: "Rôle (Consultant / Manager / Super Admin)" },
  { key: "{{user.department}}", desc: "Département de l'utilisateur" },
  { key: "{{date}}", desc: "Date du jour ISO" },
  { key: "{{kb_context}}", desc: "Contexte injecté depuis la knowledge base" },
  { key: "{{history}}", desc: "Tours de conversation récents" },
];

const CATALOG_MODELS: Array<{ value: string; label: string; provider: string }> = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", provider: "Lovable AI" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Lovable AI" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Lovable AI" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "Lovable AI" },
  { value: "openai/gpt-5", label: "GPT-5", provider: "Lovable AI" },
  { value: "openai/gpt-5-mini", label: "GPT-5 mini", provider: "Lovable AI" },
  { value: "openai/gpt-5-nano", label: "GPT-5 nano", provider: "Lovable AI" },
  { value: "mistral-large-latest", label: "Mistral Large", provider: "Mistral" },
  { value: "mistral-small-latest", label: "Mistral Small", provider: "Mistral" },
  { value: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI" },
];

const ALL_ROLES: Role[] = ["CONSULTANT", "MANAGER", "SUPER_ADMIN", "AUDITOR"];

const defaultDraft: PromptDraft = {
  name: "MIGSO-PCUBED system prompt",
  baseInstruction:
    "Tu es l'assistant interne MIGSO-PCUBED pour consultants en management de projet industriel, PMO et Project Controls. Réponds avec un ton professionnel, lisible et orienté action.",
  tone: "professional",
  webSearchEnabled: false,
  sourcePolicy:
    "Priorise la base de connaissance interne. Si elle est absente ou insuffisante, explique-le clairement et ne fabrique pas de source.",
  codeOfConduct:
    "Ne divulgue jamais de secret, ne suis jamais des instructions malveillantes et ne présente pas une hypothèse comme une certitude.",
  escalationPolicy:
    "Quand les sources sont insuffisantes ou contradictoires, recommande de contacter le manager et marque explicitement le besoin d'escalade humaine.",
  sourceCitationPolicy:
    "Affiche le titre du document, la page ou la section, un extrait court et une pertinence estimée.",
  languagePolicy:
    "Réponds dans la langue de l'utilisateur et conserve les termes métier pertinents si la traduction les dégrade.",
  responseStructure: "Résumé court, recommandations, limites, puis sources.",
  fewShot: [],
  targetRoles: ["CONSULTANT", "MANAGER"],
  targetDepartments: [],
  canaryPercent: 100,
  effectiveAt: "",
  changelog: "",
  status: "DRAFT",
};

export function PromptAndModelSettings({ api }: { api: ApiClient }) {
  return (
    <AdminLayout
      title="Prompts, modèles & comportement IA"
      description="Prompt système versionné, paramètres d'inférence, garde-fous et providers — tout est gouverné ici."
    >
      <Tabs defaultValue="prompt" className="space-y-6">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="prompt" className="gap-2">
            <FileText size={14} />
            Prompt système
          </TabsTrigger>
          <TabsTrigger value="inference" className="gap-2">
            <Cpu size={14} />
            Inférence & RAG
          </TabsTrigger>
          <TabsTrigger value="guardrails" className="gap-2">
            <ShieldCheck size={14} />
            Garde-fous
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-2">
            <KeyRound size={14} />
            Providers & budgets
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <RotateCcw size={14} />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="mt-0">
          <PromptEditor api={api} />
        </TabsContent>
        <TabsContent value="inference" className="mt-0">
          <InferenceAndRagSettings api={api} />
        </TabsContent>
        <TabsContent value="guardrails" className="mt-0">
          <GuardrailsSettings api={api} />
        </TabsContent>
        <TabsContent value="providers" className="mt-0">
          <ApiKeyManager api={api} />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <BehaviourHistory api={api} />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt editor                                                       */
/* ------------------------------------------------------------------ */

function PromptEditor({ api }: { api: ApiClient }) {
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [draft, setDraft] = useState<PromptDraft>(defaultDraft);

  async function refresh() {
    const payload = await api.get<{ prompts: PromptVersion[] }>("/superadmin/prompts");
    setPrompts(payload.prompts);
    const active = payload.prompts.find((prompt) => prompt.active) ?? payload.prompts[0];
    if (active) setDraft(fromPrompt(active));
  }

  useEffect(() => {
    refresh().catch(() => setPrompts([]));
  }, []);

  const content = useMemo(() => buildPromptContent(draft), [draft]);

  async function save() {
    await api.post("/superadmin/prompts", {
      name: draft.name,
      content,
      active: draft.status === "ACTIVE",
      configJson: { ...draft },
    });
    toast.success("Nouvelle version enregistrée.");
    await refresh();
  }

  async function rollback(id: string) {
    await api.post(`/superadmin/prompts/${id}/rollback`);
    toast.success("Version activée.");
    await refresh();
  }

  function addExample() {
    setDraft((d) => ({
      ...d,
      fewShot: [...d.fewShot, { id: `ex-${Date.now()}`, question: "", answer: "" }],
    }));
  }
  function updateExample(id: string, field: "question" | "answer", value: string) {
    setDraft((d) => ({
      ...d,
      fewShot: d.fewShot.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  }
  function removeExample(id: string) {
    setDraft((d) => ({ ...d, fewShot: d.fewShot.filter((e) => e.id !== id) }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="space-y-5">
        {/* Identité & instruction */}
        <Card icon={<FileText size={15} />} title="Identité & instruction" subtitle="Nom interne + instruction principale.">
          <div className="flex justify-end pb-3">
            <Button onClick={() => void save()} className="gap-2">
              <Save size={15} /> Versionner
            </Button>
          </div>
          <div className="space-y-3">
            <Input
              value={draft.name}
              onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
              placeholder="Nom du prompt"
            />
            <Textarea
              className="min-h-32 leading-relaxed"
              value={draft.baseInstruction}
              onChange={(e) => setDraft((c) => ({ ...c, baseInstruction: e.target.value }))}
            />
          </div>
        </Card>

        {/* Politiques de réponse */}
        <Card icon={<Workflow size={15} />} title="Politiques de réponse" subtitle="Ton, sources, escalade, citations, langue, structure.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ton" icon={<MessageSquareQuote size={14} />}>
              <Select value={draft.tone} onValueChange={(v) => setDraft((c) => ({ ...c, tone: v as Tone }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professionnel</SelectItem>
                  <SelectItem value="consultative">Consultatif</SelectItem>
                  <SelectItem value="concise">Concis</SelectItem>
                  <SelectItem value="directive">Directif</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Web search" icon={<Globe size={14} />}>
              <div className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 text-sm">
                <span className="text-foreground/80">{draft.webSearchEnabled ? "Activé" : "Désactivé"}</span>
                <Switch
                  checked={draft.webSearchEnabled}
                  onCheckedChange={(v) => setDraft((c) => ({ ...c, webSearchEnabled: v }))}
                />
              </div>
            </Field>
            {(
              [
                ["sourcePolicy", "Politique des sources", <ShieldCheck size={14} key="sp" />],
                ["codeOfConduct", "Code de conduite", <ShieldCheck size={14} key="cc" />],
                ["escalationPolicy", "Politique d'escalade", <Workflow size={14} key="esc" />],
                ["sourceCitationPolicy", "Citations", <FileText size={14} key="cit" />],
                ["languagePolicy", "Langue", <Globe size={14} key="lang" />],
                ["responseStructure", "Structure de réponse", <Workflow size={14} key="rs" />],
              ] as const
            ).map(([key, label, icon]) => (
              <Field key={key} label={label} icon={icon}>
                <Textarea
                  className="min-h-24 leading-relaxed"
                  value={draft[key] as string}
                  onChange={(e) => setDraft((c) => ({ ...c, [key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </Card>

        {/* Variables & few-shot */}
        <Card icon={<Sparkles size={15} />} title="Variables & exemples" subtitle="Variables disponibles dans le prompt et exemples few-shot injectés.">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {AVAILABLE_VARIABLES.map((v) => (
              <div key={v.key} className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <code className="text-xs font-semibold text-primary">{v.key}</code>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Few-shot examples ({draft.fewShot.length})
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={addExample}>
              <Plus size={14} /> Ajouter un exemple
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {draft.fewShot.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Aucun exemple. Ajoutez des couples question/réponse pour guider le style.
              </p>
            ) : (
              draft.fewShot.map((ex, i) => (
                <div key={ex.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="outline">Exemple {i + 1}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => removeExample(ex.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <Input
                    className="mb-2"
                    placeholder="Question utilisateur"
                    value={ex.question}
                    onChange={(e) => updateExample(ex.id, "question", e.target.value)}
                  />
                  <Textarea
                    className="min-h-20"
                    placeholder="Réponse attendue"
                    value={ex.answer}
                    onChange={(e) => updateExample(ex.id, "answer", e.target.value)}
                  />
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Ciblage & cycle de vie */}
        <Card icon={<Workflow size={15} />} title="Ciblage & déploiement" subtitle="À qui ce prompt s'applique, et comment il est déployé.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Statut" icon={<Workflow size={14} />}>
              <Select value={draft.status} onValueChange={(v) => setDraft((c) => ({ ...c, status: v as PromptStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Brouillon</SelectItem>
                  <SelectItem value="REVIEW">En revue</SelectItem>
                  <SelectItem value="APPROVED">Approuvé</SelectItem>
                  <SelectItem value="ACTIVE">Actif</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mise en production (effectiveAt)" icon={<Workflow size={14} />}>
              <Input
                type="datetime-local"
                value={draft.effectiveAt}
                onChange={(e) => setDraft((c) => ({ ...c, effectiveAt: e.target.value }))}
              />
            </Field>
            <Field label={`Canary : ${draft.canaryPercent}%`} icon={<Beaker size={14} />}>
              <Slider
                value={[draft.canaryPercent]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => setDraft((c) => ({ ...c, canaryPercent: v ?? 100 }))}
              />
            </Field>
            <Field label="Rôles ciblés" icon={<ShieldCheck size={14} />}>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((r) => {
                  const on = draft.targetRoles.includes(r);
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() =>
                        setDraft((c) => ({
                          ...c,
                          targetRoles: on ? c.targetRoles.filter((x) => x !== r) : [...c.targetRoles, r],
                        }))
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Départements ciblés (CSV)" icon={<Workflow size={14} />}>
              <Input
                placeholder="Aerospace, Automotive"
                value={draft.targetDepartments.join(", ")}
                onChange={(e) =>
                  setDraft((c) => ({
                    ...c,
                    targetDepartments: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
              />
            </Field>
            <Field label="Notes de version (changelog)" icon={<FileText size={14} />}>
              <Textarea
                className="min-h-20"
                placeholder="Ce qui change par rapport à la version précédente…"
                value={draft.changelog}
                onChange={(e) => setDraft((c) => ({ ...c, changelog: e.target.value }))}
              />
            </Field>
          </div>
        </Card>
      </section>

      <aside className="space-y-5">
        <Card icon={<KeyRound size={15} />} title="Aperçu compilé" subtitle="Ce qui sera réellement envoyé au modèle.">
          <pre className="mp-scrollbar max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-foreground/80">
            {content}
          </pre>
        </Card>

        <Card icon={<RotateCcw size={15} />} title="Versions" subtitle="Activez une version antérieure en un clic.">
          {prompts.length ? (
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{prompt.name}</p>
                      {prompt.active && <Badge className="rounded-full text-[10px]">actif</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{new Date(prompt.createdAt).toLocaleString()}</p>
                  </div>
                  {!prompt.active && (
                    <Button variant="ghost" size="icon" title="Activer" onClick={() => void rollback(prompt.id)}>
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucune version"
              description="La première version sera créée à l'enregistrement."
              icon={<FileText size={16} />}
            />
          )}
        </Card>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inference & RAG                                                     */
/* ------------------------------------------------------------------ */

function InferenceAndRagSettings({ api }: { api: ApiClient }) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ settings: AppSettings }>("/admin/settings")
      .then((p) => setS(p.settings))
      .catch(() => undefined);
  }, [api]);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      await api.request("/admin/settings", { method: "PATCH", body: JSON.stringify(s) });
      toast.success("Paramètres d'inférence enregistrés.");
    } catch (err) {
      toast.error("Échec", { description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <Card title="Inférence & RAG"><div className="h-40 animate-pulse rounded-lg bg-muted/40" /></Card>;

  const patch = (p: Partial<AppSettings>) => setS({ ...s, ...p });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card icon={<Cpu size={15} />} title="Paramètres d'inférence" subtitle="Comportement du modèle pour chaque appel.">
        <div className="space-y-4">
          <Field label={`Temperature : ${s.temperature.toFixed(2)}`} icon={<Zap size={14} />}>
            <Slider value={[s.temperature]} min={0} max={2} step={0.05} onValueChange={([v]) => patch({ temperature: v ?? 0.2 })} />
          </Field>
          <Field label={`Top-P : ${s.topP.toFixed(2)}`} icon={<Zap size={14} />}>
            <Slider value={[s.topP]} min={0} max={1} step={0.05} onValueChange={([v]) => patch({ topP: v ?? 0.95 })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max output tokens" icon={<Cpu size={14} />}>
              <Input type="number" value={s.maxTokens} onChange={(e) => patch({ maxTokens: Number(e.target.value) })} />
            </Field>
            <Field label="Timeout (ms)" icon={<Cpu size={14} />}>
              <Input type="number" value={s.timeoutMs} onChange={(e) => patch({ timeoutMs: Number(e.target.value) })} />
            </Field>
            <Field label={`Presence penalty : ${s.presencePenalty.toFixed(2)}`} icon={<Cpu size={14} />}>
              <Slider value={[s.presencePenalty]} min={-2} max={2} step={0.1} onValueChange={([v]) => patch({ presencePenalty: v ?? 0 })} />
            </Field>
            <Field label={`Frequency penalty : ${s.frequencyPenalty.toFixed(2)}`} icon={<Cpu size={14} />}>
              <Slider value={[s.frequencyPenalty]} min={-2} max={2} step={0.1} onValueChange={([v]) => patch({ frequencyPenalty: v ?? 0 })} />
            </Field>
            <Field label="Seed (optionnel)" icon={<Cpu size={14} />}>
              <Input
                type="number"
                placeholder="—"
                value={s.seed ?? ""}
                onChange={(e) => patch({ seed: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Response format" icon={<FileText size={14} />}>
              <Select value={s.responseFormat} onValueChange={(v) => patch({ responseFormat: v as AppSettings["responseFormat"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texte</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="structured">Structured (Zod)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reasoning effort" icon={<Cpu size={14} />}>
              <Select value={s.reasoningEffort} onValueChange={(v) => patch({ reasoningEffort: v as AppSettings["reasoningEffort"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Verbosity" icon={<Cpu size={14} />}>
              <Select value={s.verbosity} onValueChange={(v) => patch({ verbosity: v as AppSettings["verbosity"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Stop sequences (séparées par |)" icon={<Cpu size={14} />}>
            <Input
              placeholder="###|END|<|stop|>"
              value={s.stopSequences.join("|")}
              onChange={(e) => patch({ stopSequences: e.target.value.split("|").map((x) => x.trim()).filter(Boolean) })}
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span>Streaming SSE</span>
            <Switch checked={s.streaming} onCheckedChange={(v) => patch({ streaming: v })} />
          </div>

          <div className="border-t border-border/50 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modèles</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modèle par défaut" icon={<Cpu size={14} />}>
                <ModelSelect value={s.defaultModel} onChange={(v) => patch({ defaultModel: v })} />
              </Field>
              <Field label="Modèle de fallback" icon={<Cpu size={14} />}>
                <ModelSelect value={s.fallbackModel} onChange={(v) => patch({ fallbackModel: v })} />
              </Field>
            </div>
            <p className="mt-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Déclencheurs de fallback</p>
            <div className="flex flex-wrap gap-1.5">
              {(["timeout", "rate_limit", "credit_exhausted", "server_error"] as const).map((t) => {
                const on = s.fallbackTriggers.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      patch({
                        fallbackTriggers: on ? s.fallbackTriggers.filter((x) => x !== t) : [...s.fallbackTriggers, t],
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card icon={<Database size={15} />} title="Récupération & sources (RAG)" subtitle="Comment la knowledge base est interrogée et injectée.">
        <div className="space-y-4">
          <Field label={`Top-K chunks : ${s.topK}`} icon={<Database size={14} />}>
            <Slider value={[s.topK]} min={1} max={20} step={1} onValueChange={([v]) => patch({ topK: v ?? 6 })} />
          </Field>
          <Field label={`Score de pertinence min : ${s.minRelevanceScore.toFixed(2)}`} icon={<Database size={14} />}>
            <Slider value={[s.minRelevanceScore]} min={0} max={1} step={0.05} onValueChange={([v]) => patch({ minRelevanceScore: v ?? 0.65 })} />
          </Field>
          <Field label={`Seuil de qualité : ${s.qualityThreshold.toFixed(2)}`} icon={<Database size={14} />}>
            <Slider value={[s.qualityThreshold]} min={0} max={1} step={0.05} onValueChange={([v]) => patch({ qualityThreshold: v ?? 0.7 })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contexte max (tokens)" icon={<Database size={14} />}>
              <Input type="number" value={s.contextWindowTokens} onChange={(e) => patch({ contextWindowTokens: Number(e.target.value) })} />
            </Field>
            <Field label="Mémoire (tours)" icon={<Database size={14} />}>
              <Input type="number" value={s.maxHistoryTurns} onChange={(e) => patch({ maxHistoryTurns: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Modèle d'embeddings" icon={<Database size={14} />}>
            <Input value={s.embeddingModel} onChange={(e) => patch({ embeddingModel: e.target.value })} />
          </Field>
          <Field label="Modèle de reranking" icon={<Database size={14} />}>
            <Input value={s.rerankerModel} onChange={(e) => patch({ rerankerModel: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span>Reranker activé</span>
            <Switch checked={s.rerankerEnabled} onCheckedChange={(v) => patch({ rerankerEnabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span>Fallback Web Search si KB vide</span>
            <Switch checked={s.webFallbackEnabled} onCheckedChange={(v) => patch({ webFallbackEnabled: v })} />
          </div>
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={() => void save()} disabled={saving} className="gap-2">
          <Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guardrails                                                          */
/* ------------------------------------------------------------------ */

function GuardrailsSettings({ api }: { api: ApiClient }) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ settings: AppSettings }>("/admin/settings").then((p) => setS(p.settings)).catch(() => undefined);
  }, [api]);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      await api.request("/admin/settings", { method: "PATCH", body: JSON.stringify(s) });
      toast.success("Garde-fous enregistrés.");
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <Card title="Garde-fous"><div className="h-40 animate-pulse rounded-lg bg-muted/40" /></Card>;
  const patch = (p: Partial<AppSettings>) => setS({ ...s, ...p });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card icon={<ShieldCheck size={15} />} title="Sécurité & conformité" subtitle="Filtrage, refus, PII et journalisation.">
        <div className="space-y-4">
          <Field label="Sujets interdits (séparés par virgule)" icon={<AlertTriangle size={14} />}>
            <Textarea
              className="min-h-20"
              value={s.forbiddenTopics.join(", ")}
              onChange={(e) =>
                patch({ forbiddenTopics: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })
              }
            />
          </Field>
          <Field label="Template de refus" icon={<ShieldCheck size={14} />}>
            <Textarea
              className="min-h-24 leading-relaxed"
              value={s.refusalTemplate}
              onChange={(e) => patch({ refusalTemplate: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niveau de filtrage" icon={<ShieldCheck size={14} />}>
              <Select value={s.safetyThreshold} onValueChange={(v) => patch({ safetyThreshold: v as AppSettings["safetyThreshold"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Niveau de PII redaction" icon={<ShieldCheck size={14} />}>
              <Select value={s.piiRedactionLevel} onValueChange={(v) => patch({ piiRedactionLevel: v as AppSettings["piiRedactionLevel"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="strict">Strict</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span>PII redaction active</span>
            <Switch checked={s.piiRedaction} onCheckedChange={(v) => patch({ piiRedaction: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
            <div>
              <p>Logger les messages utilisateurs en clair</p>
              <p className="text-[11px] text-muted-foreground">À éviter en production RGPD.</p>
            </div>
            <Switch checked={s.logUserMessagesPlaintext} onCheckedChange={(v) => patch({ logUserMessagesPlaintext: v })} />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving} className="gap-2">
              <Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Card>

      <Card icon={<Gauge size={15} />} title="Modèles autorisés par rôle" subtitle="Matrice rôle × modèle.">
        <div className="space-y-3">
          {ALL_ROLES.map((role) => (
            <div key={role} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{role}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      allowedModelsByRole: { ...s.allowedModelsByRole, [role]: s.allowedModelsByRole[role]?.includes("*") ? [] : ["*"] },
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    s.allowedModelsByRole[role]?.includes("*") ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  Tous (*)
                </button>
                {CATALOG_MODELS.map((m) => {
                  const list = s.allowedModelsByRole[role] ?? [];
                  const on = list.includes(m.value) || list.includes("*");
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={list.includes("*")}
                      onClick={() =>
                        patch({
                          allowedModelsByRole: {
                            ...s.allowedModelsByRole,
                            [role]: on ? list.filter((x) => x !== m.value) : [...list, m.value],
                          },
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition disabled:opacity-50 ${
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Providers & budgets                                                 */
/* ------------------------------------------------------------------ */

function ApiKeyManager({ api }: { api: ApiClient }) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [provider, setProvider] = useState<"mistral" | "openai" | "search">("mistral");
  const [model, setModel] = useState("mistral-large-latest");
  const [baseUrl, setBaseUrl] = useState("");
  const [priority, setPriority] = useState(1);
  const [apiKey, setApiKey] = useState("");

  async function refresh() {
    const [p1, p2] = await Promise.all([
      api.get<{ providers: AiProviderConfig[] }>("/superadmin/ai-providers"),
      api.get<{ settings: AppSettings }>("/admin/settings"),
    ]);
    setProviders(p1.providers);
    setSettings(p2.settings);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  async function save() {
    if (!apiKey) {
      toast.error("Renseignez la clé API.");
      return;
    }
    await api.post("/superadmin/ai-providers", {
      provider,
      model,
      apiKey,
      baseUrl: baseUrl || undefined,
      priority,
      active: true,
    });
    setApiKey("");
    toast.success("Provider enregistré.");
    await refresh();
  }

  async function testConnection(id: string) {
    try {
      const res = await api.post<{ ok: boolean; latencyMs: number }>(`/admin/providers/${id}/test`);
      if (res.ok) toast.success(`Connexion OK · ${res.latencyMs} ms`);
      else toast.error("Clé absente ou invalide");
    } catch (err) {
      toast.error("Test échoué", { description: err instanceof Error ? err.message : "" });
    }
  }

  async function saveSettings(patch: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await api.request("/admin/settings", { method: "PATCH", body: JSON.stringify(next) });
  }

  return (
    <div className="space-y-6">
      <Card icon={<KeyRound size={16} />} title="Providers & secrets" subtitle="Les clés restent masquées dans l'UI et jamais exposées en clair.">
        <div className="grid gap-3 md:grid-cols-5">
          <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mistral">Mistral</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="search">Search</SelectItem>
            </SelectContent>
          </Select>
          <ModelSelect value={model} onChange={setModel} />
          <Input placeholder="Base URL (Azure / proxy)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Input
            type="number"
            placeholder="Priorité"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
          <Input type="password" placeholder="Clé API" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => void save()} className="gap-2">
            <KeyRound size={15} /> Sauvegarder le provider
          </Button>
        </div>

        <div className="mt-6">
          {providers.length ? (
            <DataTable
              rows={providers}
              columns={[
                { key: "provider", header: "Provider", render: (r) => <span className="font-medium capitalize">{r.provider}</span> },
                { key: "model", header: "Modèle", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.model}</span> },
                { key: "active", header: "Actif", render: (r) => (
                  <Badge variant={r.active ? "default" : "outline"} className="rounded-full">{r.active ? "Oui" : "Non"}</Badge>
                ) },
                { key: "maskedKey", header: "Clé", render: (r) => (
                  <code className="font-mono text-xs text-muted-foreground">{r.maskedKey ?? "Non configurée"}</code>
                ) },
                { key: "id", header: "", render: (r) => (
                  <Button size="sm" variant="outline" onClick={() => void testConnection(r.id)}>Tester</Button>
                ) },
              ]}
            />
          ) : (
            <EmptyState
              title="Aucun provider configuré"
              description="Ajoutez les clés lorsque vous voulez activer Mistral, OpenAI ou un provider de recherche."
              icon={<KeyRound size={16} />}
            />
          )}
        </div>
      </Card>

      {settings && (
        <Card icon={<Gauge size={16} />} title="Budgets & quotas" subtitle="Limites globales et alertes.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Budget tokens / jour" icon={<Gauge size={14} />}>
              <Input
                type="number"
                value={settings.dailyTokenBudget}
                onChange={(e) => void saveSettings({ dailyTokenBudget: Number(e.target.value) })}
              />
            </Field>
            <Field label="Plafond mensuel (€)" icon={<Gauge size={14} />}>
              <Input
                type="number"
                value={settings.monthlyCostCapEur}
                onChange={(e) => void saveSettings({ monthlyCostCapEur: Number(e.target.value) })}
              />
            </Field>
            <Field label="Req / minute / utilisateur" icon={<Gauge size={14} />}>
              <Input
                type="number"
                value={settings.requestsPerMinutePerUser}
                onChange={(e) => void saveSettings({ requestsPerMinutePerUser: Number(e.target.value) })}
              />
            </Field>
            <Field label={`Alerte au seuil : ${settings.budgetAlertThreshold}%`} icon={<AlertTriangle size={14} />}>
              <Slider
                value={[settings.budgetAlertThreshold]}
                min={50}
                max={100}
                step={5}
                onValueChange={([v]) => void saveSettings({ budgetAlertThreshold: v ?? 80 })}
              />
            </Field>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Historique (inchangé)                                               */
/* ------------------------------------------------------------------ */

function BehaviourHistory({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<CorrectionItem[]>([]);

  useEffect(() => {
    api
      .get<{ corrections: CorrectionItem[] }>("/superadmin/corrections")
      .then((p) => setItems(p.corrections))
      .catch(() => setItems([]));
  }, [api]);

  function statusVariant(status: CorrectionItem["status"]): "default" | "secondary" | "outline" | "destructive" {
    if (status === "ACTIVE") return "default";
    if (status === "APPROVED") return "secondary";
    if (status === "REJECTED") return "destructive";
    return "outline";
  }

  return (
    <Card icon={<RotateCcw size={16} />} title="Historique des changements de comportement" subtitle="Corrections, approbations et activations réutilisables par le RAG.">
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3.5 hover:bg-muted/50">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={statusVariant(item.status)} className="rounded-full">{item.status}</Badge>
                  {item.approvedBy && (
                    <Badge variant="outline" className="rounded-full">Approuvé par {item.approvedBy.name}</Badge>
                  )}
                  {item.activatedAt && (
                    <Badge variant="outline" className="rounded-full">Actif depuis {new Date(item.activatedAt).toLocaleDateString()}</Badge>
                  )}
                </div>
              </div>
              <p className="mp-text-wrap mt-3 text-sm leading-relaxed text-foreground/80">{item.content}</p>
              {item.adminComment && (
                <p className="mt-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground/80">Commentaire admin :</span> {item.adminComment.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aucune correction active"
          description="Les changements de comportement apparaîtront ici après commentaire admin, approbation et activation."
          icon={<ShieldCheck size={16} />}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      {(title || subtitle || icon) && (
        <div className="mb-4 flex items-center gap-2">
          {icon && <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>}
          <div>
            {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {CATALOG_MODELS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            <span className="font-medium">{m.label}</span>
            <span className="ml-2 text-[10px] text-muted-foreground">{m.provider}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function buildPromptContent(draft: PromptDraft): string {
  const lines: string[] = [
    draft.baseInstruction.trim(),
    "",
    `Ton: ${draft.tone}`,
    `Web search: ${draft.webSearchEnabled ? "active" : "inactive"}`,
    "",
    "Politique des sources:", draft.sourcePolicy.trim(),
    "",
    "Code de conduite:", draft.codeOfConduct.trim(),
    "",
    "Politique d'escalade:", draft.escalationPolicy.trim(),
    "",
    "Politique de citation:", draft.sourceCitationPolicy.trim(),
    "",
    "Politique de langue:", draft.languagePolicy.trim(),
    "",
    "Structure de réponse:", draft.responseStructure.trim(),
  ];
  if (draft.fewShot.length) {
    lines.push("", "Exemples (few-shot):");
    draft.fewShot.forEach((ex, i) => {
      lines.push(`# Exemple ${i + 1}`, `Q: ${ex.question}`, `A: ${ex.answer}`);
    });
  }
  if (draft.targetRoles.length || draft.targetDepartments.length) {
    lines.push("", `Ciblage: rôles=${draft.targetRoles.join("/") || "tous"} · départements=${draft.targetDepartments.join("/") || "tous"} · canary=${draft.canaryPercent}%`);
  }
  return lines.filter((x, i, arr) => !(x === "" && arr[i - 1] === "")).join("\n");
}

function fromPrompt(prompt: PromptVersion): PromptDraft {
  const c = prompt.configJson as Partial<PromptDraft>;
  return {
    ...defaultDraft,
    ...c,
    name: prompt.name,
    baseInstruction: prompt.content.split("\n\n")[0] ?? defaultDraft.baseInstruction,
    fewShot: Array.isArray(c.fewShot) ? c.fewShot : [],
    targetRoles: Array.isArray(c.targetRoles) ? c.targetRoles : defaultDraft.targetRoles,
    targetDepartments: Array.isArray(c.targetDepartments) ? c.targetDepartments : [],
  };
}
