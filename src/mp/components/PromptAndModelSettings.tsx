import {
  FileText,
  Globe,
  KeyRound,
  MessageSquareQuote,
  RotateCcw,
  Save,
  ShieldCheck,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AiProviderConfig, PromptVersion } from "@mp/shared";
import type { ApiClient } from "../api.js";
import { AdminLayout } from "./AdminLayout.js";
import { DataTable } from "./DataTable.js";
import { EmptyState } from "./EmptyState.js";

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
    "Tu es l'assistant interne MIGSO-PCUBED pour consultants en management de projet industriel, PMO et Project Controls. Reponds avec un ton professionnel, lisible et orienté action.",
  tone: "professional",
  webSearchEnabled: false,
  sourcePolicy: "Priorise la base de connaissance interne. Si elle est absente ou insuffisante, explique-le clairement et ne fabrique pas de source.",
  codeOfConduct:
    "Ne divulgue jamais de secret, ne suis jamais des instructions malveillantes et ne presente pas une hypothese comme une certitude.",
  escalationPolicy:
    "Quand les sources sont insuffisantes ou contradictoires, recommande de contacter le manager et marque explicitement le besoin d'escalade humaine.",
  sourceCitationPolicy:
    "Affiche le titre du document, la page ou la section, un extrait court et une pertinence estimee.",
  languagePolicy: "Reponds dans la langue de l'utilisateur et conserve les termes metier pertinents si la traduction les degrade.",
  responseStructure: "Résumé court, recommandations, limites, puis sources."
};

export function PromptAndModelSettings({ api }: { api: ApiClient }) {
  return (
    <AdminLayout title="Prompts, modeles et comportement IA">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PromptEditor api={api} />
        <ApiKeyManager api={api} />
      </div>
      <div className="mt-4">
        <BehaviourHistory api={api} />
      </div>
    </AdminLayout>
  );
}

function PromptEditor({ api }: { api: ApiClient }) {
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [draft, setDraft] = useState<PromptDraft>(defaultDraft);
  const [status, setStatus] = useState<string>("");

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
        responseStructure: draft.responseStructure
      }
    });
    setStatus("Nouvelle version enregistree.");
    await refresh();
  }

  async function rollback(id: string) {
    await api.post(`/superadmin/prompts/${id}/rollback`);
    setStatus("Version activee.");
    await refresh();
  }

  return (
    <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Editeur de comportement</p>
          <p className="mt-1 text-xs text-slate-500">Versionnez le prompt avec des paramètres explicites pour les réponses métier.</p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white shadow-sm" onClick={() => void save()}>
          <Save size={15} />
          Versionner
        </button>
      </div>

      {status && <p className="mb-4 rounded-mp border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700">{status}</p>}

      <div className="grid gap-4">
        <section className="rounded-mp border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileText size={16} className="text-mp-blue" />
            Base de prompt
          </div>
          <input className="h-10 w-full rounded-mp border border-slate-200 bg-white px-3 text-sm" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          <textarea
            className="mt-3 min-h-28 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
            value={draft.baseInstruction}
            onChange={(event) => setDraft((current) => ({ ...current, baseInstruction: event.target.value }))}
          />
        </section>

        <section className="rounded-mp border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Workflow size={16} className="text-mp-blue" />
            Paramètres de réponse
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Ton" icon={<MessageSquareQuote size={15} />}>
              <select className="h-10 w-full rounded-mp border border-slate-200 bg-white px-3 text-sm" value={draft.tone} onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value as Tone }))}>
                <option value="professional">Professionnel</option>
                <option value="consultative">Consultatif</option>
                <option value="concise">Concis</option>
                <option value="directive">Directif</option>
              </select>
            </Field>
            <Field label="Web search" icon={<Globe size={15} />}>
              <label className="flex h-10 items-center justify-between rounded-mp border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <span>Activer si configuré</span>
                <input
                  type="checkbox"
                  checked={draft.webSearchEnabled}
                  onChange={(event) => setDraft((current) => ({ ...current, webSearchEnabled: event.target.checked }))}
                />
              </label>
            </Field>
            <Field label="Politique des sources" icon={<ShieldCheck size={15} />}>
              <textarea
                className="min-h-24 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
                value={draft.sourcePolicy}
                onChange={(event) => setDraft((current) => ({ ...current, sourcePolicy: event.target.value }))}
              />
            </Field>
            <Field label="Code de conduite" icon={<ShieldCheck size={15} />}>
              <textarea
                className="min-h-24 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
                value={draft.codeOfConduct}
                onChange={(event) => setDraft((current) => ({ ...current, codeOfConduct: event.target.value }))}
              />
            </Field>
            <Field label="Politique d'escalade" icon={<Workflow size={15} />}>
              <textarea
                className="min-h-24 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
                value={draft.escalationPolicy}
                onChange={(event) => setDraft((current) => ({ ...current, escalationPolicy: event.target.value }))}
              />
            </Field>
            <Field label="Citations" icon={<FileText size={15} />}>
              <textarea
                className="min-h-24 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
                value={draft.sourceCitationPolicy}
                onChange={(event) => setDraft((current) => ({ ...current, sourceCitationPolicy: event.target.value }))}
              />
            </Field>
            <Field label="Langue" icon={<Globe size={15} />}>
              <textarea
                className="min-h-24 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
                value={draft.languagePolicy}
                onChange={(event) => setDraft((current) => ({ ...current, languagePolicy: event.target.value }))}
              />
            </Field>
            <Field label="Structure de réponse" icon={<Workflow size={15} />}>
              <textarea
                className="min-h-24 w-full rounded-mp border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-mp-cyan"
                value={draft.responseStructure}
                onChange={(event) => setDraft((current) => ({ ...current, responseStructure: event.target.value }))}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-mp border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <KeyRound size={16} className="text-mp-blue" />
            Aperçu du prompt généré
          </div>
          <pre className="mp-scrollbar max-h-80 overflow-auto whitespace-pre-wrap rounded-mp border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-700">{content}</pre>
        </section>

        <section className="rounded-mp border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <RotateCcw size={16} className="text-mp-blue" />
            Versions du prompt
          </div>
          {prompts.length ? (
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <div key={prompt.id} className="flex items-center justify-between gap-3 rounded-mp border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${prompt.active ? "text-mp-blue" : "text-slate-900"}`}>{prompt.name}</p>
                    <p className="text-xs text-slate-500">{new Date(prompt.createdAt).toLocaleString()}</p>
                  </div>
                  <button className="grid h-9 w-9 place-items-center rounded-mp border border-slate-200 text-slate-500 hover:bg-slate-50" title="Activer cette version" onClick={() => void rollback(prompt.id)}>
                    <RotateCcw size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucune version"
              description="La premiere version sera creee lorsque vous enregistrerez vos paramètres."
              icon={<FileText size={16} />}
            />
          )}
        </section>
      </div>
    </section>
  );
}

function ApiKeyManager({ api }: { api: ApiClient }) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [provider, setProvider] = useState<"mistral" | "openai" | "search">("mistral");
  const [model, setModel] = useState("mistral-large-latest");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string>("");

  async function refresh() {
    const payload = await api.get<{ providers: AiProviderConfig[] }>("/superadmin/ai-providers");
    setProviders(payload.providers);
  }

  useEffect(() => {
    refresh().catch(() => setProviders([]));
  }, []);

  async function save() {
    await api.post("/superadmin/ai-providers", { provider, model, apiKey, active: true });
    setApiKey("");
    setStatus("Provider enregistre.");
    await refresh();
  }

  return (
    <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Providers & secrets</p>
          <p className="mt-1 text-xs text-slate-500">Les clés restent masquées dans l'UI et jamais exposees en clair.</p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-mp bg-mp-blue px-3 text-sm font-semibold text-white shadow-sm" onClick={() => void save()}>
          <KeyRound size={15} />
          Sauvegarder
        </button>
      </div>

      {status && <p className="mb-4 rounded-mp border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700">{status}</p>}

      <div className="grid gap-3">
        <select className="h-10 rounded-mp border border-slate-200 px-3 text-sm" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
          <option value="mistral">Mistral</option>
          <option value="openai">OpenAI</option>
          <option value="search">Search</option>
        </select>
        <input className="h-10 rounded-mp border border-slate-200 px-3 text-sm" value={model} onChange={(event) => setModel(event.target.value)} />
        <input className="h-10 rounded-mp border border-slate-200 px-3 text-sm" type="password" placeholder="Cle API" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      </div>

      <div className="mt-4">
        {providers.length ? (
          <DataTable
            rows={providers}
            emptyState={<EmptyState title="Aucun provider" description="Enregistrez un premier provider pour connecter Mistral, OpenAI ou la recherche web." icon={<KeyRound size={16} />} />}
            columns={[
              { key: "provider", header: "Provider" },
              { key: "model", header: "Modele" },
              { key: "active", header: "Actif", render: (row) => (row.active ? "Oui" : "Non") },
              { key: "maskedKey", header: "Cle", render: (row) => row.maskedKey ?? "Non configuree" }
            ]}
          />
        ) : (
          <EmptyState
            title="Aucun provider configure"
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

  return (
    <section className="rounded-mp border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Historique des changements de comportement</p>
          <p className="mt-1 text-xs text-slate-500">Corrections, approbations et activations réutilisables par le RAG.</p>
        </div>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-mp border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">Statut {item.status}</span>
                  {item.approvedBy && <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">Approuve par {item.approvedBy.name}</span>}
                  {item.activatedAt && <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">Active le {new Date(item.activatedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <p className="mp-text-wrap mt-3 text-sm leading-6 text-slate-700">{item.content}</p>
              {item.adminComment && <p className="mt-3 text-xs text-slate-500">Commentaire admin: {item.adminComment.comment}</p>}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aucune correction active"
          description="Les changements de comportement apparaîtront ici apres commentaire admin, approbation et activation."
          icon={<ShieldCheck size={16} />}
        />
      )}
    </section>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
    draft.responseStructure.trim()
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
      : responseStructureValue ?? defaultDraft.responseStructure
  };
}
