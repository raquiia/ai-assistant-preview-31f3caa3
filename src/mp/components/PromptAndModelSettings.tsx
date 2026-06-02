import {
  FileText,
  Globe,
  KeyRound,
  MessageSquareQuote,
  RotateCcw,
  Save,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AiProviderConfig, PromptVersion } from "../shared";
import type { ApiClient } from "../api";
import { AdminLayout } from "./AdminLayout";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
};

export function PromptAndModelSettings({ api }: { api: ApiClient }) {
  return (
    <AdminLayout
      title="Prompts, modèles & comportement IA"
      description="Versionnez le prompt système, gérez les providers et consultez l'historique des corrections."
    >
      <Tabs defaultValue="prompt" className="space-y-6">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="prompt" className="gap-2">
            <FileText size={14} />
            Prompt système
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-2">
            <KeyRound size={14} />
            Providers & secrets
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <RotateCcw size={14} />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="mt-0">
          <PromptEditor api={api} />
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

function PromptEditor({ api }: { api: ApiClient }) {
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [draft, setDraft] = useState<PromptDraft>(defaultDraft);

  async function refresh() {
    const payload = await api.get<{ prompts: PromptVersion[] }>("/superadmin/prompts");
    setPrompts(payload.prompts);
    const active = payload.prompts.find((prompt) => prompt.active) ?? payload.prompts[0];
    if (active) {
      setDraft(fromPrompt(active));
    }
  }

  useEffect(() => {
    refresh().catch(() => setPrompts([]));
  }, []);

  const content = useMemo(() => buildPromptContent(draft), [draft]);

  async function save() {
    await api.post("/superadmin/prompts", {
      name: draft.name,
      content,
      active: true,
      configJson: {
        tone: draft.tone,
        webSearchEnabled: draft.webSearchEnabled,
        sourcePolicy: draft.sourcePolicy,
        codeOfConduct: draft.codeOfConduct,
        escalationPolicy: draft.escalationPolicy,
        sourceCitationPolicy: draft.sourceCitationPolicy,
        languagePolicy: draft.languagePolicy,
        responseStructure: draft.responseStructure,
      },
    });
    toast.success("Nouvelle version enregistrée.");
    await refresh();
  }

  async function rollback(id: string) {
    await api.post(`/superadmin/prompts/${id}/rollback`);
    toast.success("Version activée.");
    await refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Base de prompt</p>
                <p className="text-xs text-muted-foreground">Nom interne + instruction principale.</p>
              </div>
            </div>
            <Button onClick={() => void save()} className="gap-2">
              <Save size={15} />
              Versionner
            </Button>
          </div>
          <div className="space-y-3">
            <Input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nom du prompt"
            />
            <Textarea
              className="min-h-32 leading-relaxed"
              value={draft.baseInstruction}
              onChange={(event) =>
                setDraft((current) => ({ ...current, baseInstruction: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Workflow size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Paramètres de réponse</p>
              <p className="text-xs text-muted-foreground">
                Ton, sources, escalade, citation et structure.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ton" icon={<MessageSquareQuote size={14} />}>
              <Select
                value={draft.tone}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, tone: value as Tone }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <span className="text-foreground/80">
                  {draft.webSearchEnabled ? "Activé" : "Désactivé"}
                </span>
                <Switch
                  checked={draft.webSearchEnabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, webSearchEnabled: checked }))
                  }
                />
              </div>
            </Field>
            <Field label="Politique des sources" icon={<ShieldCheck size={14} />}>
              <Textarea
                className="min-h-24 leading-relaxed"
                value={draft.sourcePolicy}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, sourcePolicy: event.target.value }))
                }
              />
            </Field>
            <Field label="Code de conduite" icon={<ShieldCheck size={14} />}>
              <Textarea
                className="min-h-24 leading-relaxed"
                value={draft.codeOfConduct}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, codeOfConduct: event.target.value }))
                }
              />
            </Field>
            <Field label="Politique d'escalade" icon={<Workflow size={14} />}>
              <Textarea
                className="min-h-24 leading-relaxed"
                value={draft.escalationPolicy}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, escalationPolicy: event.target.value }))
                }
              />
            </Field>
            <Field label="Citations" icon={<FileText size={14} />}>
              <Textarea
                className="min-h-24 leading-relaxed"
                value={draft.sourceCitationPolicy}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, sourceCitationPolicy: event.target.value }))
                }
              />
            </Field>
            <Field label="Langue" icon={<Globe size={14} />}>
              <Textarea
                className="min-h-24 leading-relaxed"
                value={draft.languagePolicy}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, languagePolicy: event.target.value }))
                }
              />
            </Field>
            <Field label="Structure de réponse" icon={<Workflow size={14} />}>
              <Textarea
                className="min-h-24 leading-relaxed"
                value={draft.responseStructure}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, responseStructure: event.target.value }))
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <KeyRound size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Aperçu du prompt généré</p>
              <p className="text-xs text-muted-foreground">Compilation finale envoyée au modèle.</p>
            </div>
          </div>
          <pre className="mp-scrollbar max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-foreground/80">
            {content}
          </pre>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <RotateCcw size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Versions du prompt</p>
              <p className="text-xs text-muted-foreground">Activez une version antérieure en un clic.</p>
            </div>
          </div>
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
                      {prompt.active && (
                        <Badge variant="default" className="rounded-full text-[10px]">
                          actif
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(prompt.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!prompt.active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Activer cette version"
                      onClick={() => void rollback(prompt.id)}
                    >
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
        </div>
      </aside>
    </div>
  );
}

function ApiKeyManager({ api }: { api: ApiClient }) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [provider, setProvider] = useState<"mistral" | "openai" | "search">("mistral");
  const [model, setModel] = useState("mistral-large-latest");
  const [apiKey, setApiKey] = useState("");

  async function refresh() {
    const payload = await api.get<{ providers: AiProviderConfig[] }>("/superadmin/ai-providers");
    setProviders(payload.providers);
  }

  useEffect(() => {
    refresh().catch(() => setProviders([]));
  }, []);

  async function save() {
    if (!apiKey) {
      toast.error("Renseignez la clé API.");
      return;
    }
    await api.post("/superadmin/ai-providers", { provider, model, apiKey, active: true });
    setApiKey("");
    toast.success("Provider enregistré.");
    await refresh();
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <KeyRound size={16} />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-foreground">
              Providers & secrets
            </p>
            <p className="text-xs text-muted-foreground">
              Les clés restent masquées dans l'UI et jamais exposées en clair.
            </p>
          </div>
        </div>
        <Button onClick={() => void save()} className="gap-2">
          <KeyRound size={15} />
          Sauvegarder
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Select value={provider} onValueChange={(value) => setProvider(value as typeof provider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mistral">Mistral</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="search">Search</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Modèle"
        />
        <Input
          type="password"
          placeholder="Clé API"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>

      <div className="mt-6">
        {providers.length ? (
          <DataTable
            rows={providers}
            columns={[
              {
                key: "provider",
                header: "Provider",
                render: (row) => (
                  <span className="font-medium capitalize text-foreground">{row.provider}</span>
                ),
              },
              {
                key: "model",
                header: "Modèle",
                render: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">{row.model}</span>
                ),
              },
              {
                key: "active",
                header: "Actif",
                render: (row) => (
                  <Badge variant={row.active ? "default" : "outline"} className="rounded-full">
                    {row.active ? "Oui" : "Non"}
                  </Badge>
                ),
              },
              {
                key: "maskedKey",
                header: "Clé",
                render: (row) => (
                  <code className="font-mono text-xs text-muted-foreground">
                    {row.maskedKey ?? "Non configurée"}
                  </code>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="Aucun provider configuré"
            description="Ajoutez les clés lorsque vous voulez activer Mistral, OpenAI fallback ou un provider de recherche."
            icon={<KeyRound size={16} />}
          />
        )}
      </div>
    </section>
  );
}

function BehaviourHistory({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<CorrectionItem[]>([]);

  useEffect(() => {
    api
      .get<{ corrections: CorrectionItem[] }>("/superadmin/corrections")
      .then((payload) => setItems(payload.corrections))
      .catch(() => setItems([]));
  }, [api]);

  function statusVariant(status: CorrectionItem["status"]): "default" | "secondary" | "outline" | "destructive" {
    if (status === "ACTIVE") return "default";
    if (status === "APPROVED") return "secondary";
    if (status === "REJECTED") return "destructive";
    return "outline";
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <RotateCcw size={16} />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-foreground">
              Historique des changements de comportement
            </p>
            <p className="text-xs text-muted-foreground">
              Corrections, approbations et activations réutilisables par le RAG.
            </p>
          </div>
        </div>
      </div>
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3.5 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={statusVariant(item.status)} className="rounded-full">
                    {item.status}
                  </Badge>
                  {item.approvedBy && (
                    <Badge variant="outline" className="rounded-full">
                      Approuvé par {item.approvedBy.name}
                    </Badge>
                  )}
                  {item.activatedAt && (
                    <Badge variant="outline" className="rounded-full">
                      Actif depuis le {new Date(item.activatedAt).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="mp-text-wrap mt-3 text-sm leading-relaxed text-foreground/80">
                {item.content}
              </p>
              {item.adminComment && (
                <p className="mt-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground/80">Commentaire admin :</span>{" "}
                  {item.adminComment.comment}
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
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
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

function buildPromptContent(draft: PromptDraft): string {
  return [
    draft.baseInstruction.trim(),
    "",
    `Ton: ${draft.tone}`,
    `Web search: ${draft.webSearchEnabled ? "active" : "inactive"}`,
    "",
    "Politique des sources:",
    draft.sourcePolicy.trim(),
    "",
    "Code de conduite:",
    draft.codeOfConduct.trim(),
    "",
    "Politique d'escalade:",
    draft.escalationPolicy.trim(),
    "",
    "Politique de citation:",
    draft.sourceCitationPolicy.trim(),
    "",
    "Politique de langue:",
    draft.languagePolicy.trim(),
    "",
    "Structure de réponse:",
    draft.responseStructure.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function fromPrompt(prompt: PromptVersion): PromptDraft {
  const config = prompt.configJson as Partial<PromptDraft & { webSearchEnabled?: boolean }>;
  const responseStructureValue = config.responseStructure;
  return {
    name: prompt.name,
    baseInstruction: prompt.content.split("\n\n")[0] ?? defaultDraft.baseInstruction,
    tone: (config.tone as Tone) ?? defaultDraft.tone,
    webSearchEnabled: Boolean(config.webSearchEnabled),
    sourcePolicy: config.sourcePolicy ?? defaultDraft.sourcePolicy,
    codeOfConduct: config.codeOfConduct ?? defaultDraft.codeOfConduct,
    escalationPolicy: config.escalationPolicy ?? defaultDraft.escalationPolicy,
    sourceCitationPolicy: config.sourceCitationPolicy ?? defaultDraft.sourceCitationPolicy,
    languagePolicy: config.languagePolicy ?? defaultDraft.languagePolicy,
    responseStructure: Array.isArray(responseStructureValue)
      ? responseStructureValue.join("\n")
      : responseStructureValue ?? defaultDraft.responseStructure,
  };
}
