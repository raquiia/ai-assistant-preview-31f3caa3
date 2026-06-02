// SuperAdmin — Gestion des clés API IA (Wave 6.B).
// UI dédiée pour saisir/éditer/tester/roter/supprimer les clés des providers
// (Mistral, OpenAI, Tavily, SerpAPI) stockées côté backend dans AWS Secrets
// Manager (`mp/ai/<provider>`). Aucune clé n'est jamais affichée en clair —
// l'API renvoie uniquement `maskedKey` ("••••••abcd").
//
// Endpoints attendus (mockés ici et implémentés côté Fastify + aiProviderService) :
//   GET    /superadmin/ai-providers                  -> MaskedProvider[]
//   POST   /superadmin/ai-providers                  -> upsert { provider, apiKey, model?, configJson? }
//   POST   /superadmin/ai-providers/:provider/test   -> { ok, latencyMs }
//   PATCH  /superadmin/ai-providers/:provider/rotate -> { newKey } → masque + historique
//   DELETE /superadmin/ai-providers/:provider
//   GET    /superadmin/ai-providers/:provider/history-> { events: RotationEvent[] }

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  History as HistoryIcon,
  KeyRound,
  Pencil,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiClient } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type ProviderName = "mistral" | "openai" | "tavily" | "serpapi";

interface MaskedProvider {
  provider: ProviderName;
  model?: string;
  configJson?: Record<string, unknown>;
  maskedKey: string | null;
  updatedAt: string | null;
}

interface RotationEvent {
  id: string;
  action: "set" | "rotate" | "delete";
  actorName: string;
  at: string;
  metadata?: Record<string, unknown>;
}

const PROVIDER_META: Record<ProviderName, { label: string; help: string; defaultModel: string }> = {
  mistral: {
    label: "Mistral",
    help: "Clé console.mistral.ai — utilisée pour le chat principal et la classification.",
    defaultModel: "mistral-large-latest",
  },
  openai: {
    label: "OpenAI",
    help: "Clé platform.openai.com — fallback chat + embeddings text-embedding-3-large.",
    defaultModel: "gpt-4o-mini",
  },
  tavily: {
    label: "Tavily",
    help: "Recherche web temps réel pour le fallback Knowledge Base.",
    defaultModel: "tavily-search-v1",
  },
  serpapi: {
    label: "SerpAPI",
    help: "Provider de recherche alternatif (Google SERP).",
    defaultModel: "serpapi-google",
  },
};

const ALL_PROVIDERS: ProviderName[] = ["mistral", "openai", "tavily", "serpapi"];

export function AiProvidersAdmin({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<MaskedProvider[] | null>(null);
  const [editing, setEditing] = useState<ProviderName | null>(null);
  const [historyOf, setHistoryOf] = useState<ProviderName | null>(null);
  const [testing, setTesting] = useState<ProviderName | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ providers: MaskedProvider[] }>("/superadmin/ai-providers");
      // Merge with the full provider list so unconfigured ones are still shown
      const map = new Map(res.providers.map((p) => [p.provider, p]));
      const merged: MaskedProvider[] = ALL_PROVIDERS.map(
        (name) =>
          map.get(name) ?? {
            provider: name,
            maskedKey: null,
            updatedAt: null,
            model: PROVIDER_META[name].defaultModel,
            configJson: {},
          },
      );
      setItems(merged);
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : "",
      });
      setItems([]);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runTest(provider: ProviderName) {
    setTesting(provider);
    try {
      const res = await api.post<{ ok: boolean; latencyMs: number }>(
        `/superadmin/ai-providers/${provider}/test`,
      );
      if (res.ok) {
        toast.success(`${PROVIDER_META[provider].label} OK`, {
          description: `Latence ${res.latencyMs} ms`,
        });
      } else {
        toast.error(`${PROVIDER_META[provider].label} : clé invalide ou absente`);
      }
    } catch (err) {
      toast.error("Test échoué", { description: err instanceof Error ? err.message : "" });
    } finally {
      setTesting(null);
    }
  }

  async function remove(provider: ProviderName) {
    if (!confirm(`Supprimer la clé ${PROVIDER_META[provider].label} ? Recovery window 7 jours.`)) return;
    try {
      await api.request(`/superadmin/ai-providers/${provider}`, { method: "DELETE" });
      toast.success("Clé supprimée");
      await refresh();
    } catch (err) {
      toast.error("Suppression échouée", {
        description: err instanceof Error ? err.message : "",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium">Stockage chiffré AWS Secrets Manager</p>
            <p className="text-muted-foreground">
              Les clés sont écrites dans <code className="rounded bg-muted px-1 py-0.5 text-xs">mp/ai/&lt;provider&gt;</code>,
              chiffrées via KMS, et lues côté API avec un cache TTL 5 min. Une Lambda de rotation
              automatique se déclenche tous les 30 jours.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items === null
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/60">
                <CardHeader>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-2 h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))
          : items.map((p) => (
              <ProviderCard
                key={p.provider}
                item={p}
                onEdit={() => setEditing(p.provider)}
                onTest={() => void runTest(p.provider)}
                onDelete={() => void remove(p.provider)}
                onHistory={() => setHistoryOf(p.provider)}
                testing={testing === p.provider}
              />
            ))}
      </div>

      {editing && (
        <EditDialog
          api={api}
          provider={editing}
          existing={items?.find((i) => i.provider === editing) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}

      {historyOf && (
        <HistoryDialog
          api={api}
          provider={historyOf}
          onClose={() => setHistoryOf(null)}
        />
      )}
    </div>
  );
}

function ProviderCard({
  item,
  onEdit,
  onTest,
  onDelete,
  onHistory,
  testing,
}: {
  item: MaskedProvider;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  onHistory: () => void;
  testing: boolean;
}) {
  const configured = Boolean(item.maskedKey);
  const meta = PROVIDER_META[item.provider];

  return (
    <Card className="border-border/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-primary" />
              {meta.label}
            </CardTitle>
            <CardDescription className="mt-1">{meta.help}</CardDescription>
          </div>
          <Badge
            variant={configured ? "default" : "outline"}
            className="shrink-0 rounded-full text-[10px]"
          >
            {configured ? (
              <>
                <CheckCircle2 className="mr-1 size-3" /> Configurée
              </>
            ) : (
              "Absente"
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Clé masquée
            </Label>
            <code className="mt-1 block truncate rounded bg-muted px-2 py-1.5 font-mono">
              {item.maskedKey ?? "—"}
            </code>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Modèle par défaut
            </Label>
            <code className="mt-1 block truncate rounded bg-muted px-2 py-1.5 font-mono">
              {item.model ?? "—"}
            </code>
          </div>
        </div>
        {item.updatedAt && (
          <p className="text-[11px] text-muted-foreground">
            Dernière mise à jour : {new Date(item.updatedAt).toLocaleString()}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="default" onClick={onEdit} className="gap-1.5">
            <Pencil className="size-3.5" />
            {configured ? "Modifier" : "Configurer"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={!configured || testing}
            className="gap-1.5"
          >
            <Plug className={`size-3.5 ${testing ? "animate-pulse" : ""}`} />
            {testing ? "Test…" : "Tester"}
          </Button>
          <Button size="sm" variant="outline" onClick={onHistory} className="gap-1.5">
            <HistoryIcon className="size-3.5" /> Historique
          </Button>
          {configured && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  api,
  provider,
  existing,
  onClose,
  onSaved,
}: {
  api: ApiClient;
  provider: ProviderName;
  existing: MaskedProvider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = PROVIDER_META[provider];
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(existing?.model ?? meta.defaultModel);
  const [configJson, setConfigJson] = useState(
    JSON.stringify(existing?.configJson ?? {}, null, 2),
  );
  const [saving, setSaving] = useState(false);
  const isRotation = Boolean(existing?.maskedKey);

  async function save() {
    if (!apiKey || apiKey.length < 8) {
      toast.error("Clé API requise (≥ 8 caractères)");
      return;
    }
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = configJson.trim() ? JSON.parse(configJson) : {};
    } catch {
      toast.error("Config JSON invalide");
      return;
    }
    setSaving(true);
    try {
      if (isRotation) {
        await api.request(`/superadmin/ai-providers/${provider}/rotate`, {
          method: "PATCH",
          body: JSON.stringify({ apiKey, model, configJson: parsedConfig }),
        });
        toast.success(`${meta.label} : clé pivotée`);
      } else {
        await api.post("/superadmin/ai-providers", {
          provider,
          apiKey,
          model,
          configJson: parsedConfig,
        });
        toast.success(`${meta.label} configuré`);
      }
      onSaved();
    } catch (err) {
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {isRotation ? `Roter la clé ${meta.label}` : `Configurer ${meta.label}`}
          </DialogTitle>
          <DialogDescription>{meta.help}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">
              Nouvelle clé API <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isRotation ? "Coller la nouvelle clé…" : "sk-…"}
                className="pr-10 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {existing?.maskedKey && (
              <p className="text-[11px] text-muted-foreground">
                Actuelle : <code className="font-mono">{existing.maskedKey}</code> — sera remplacée.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Modèle par défaut</Label>
            {provider === "mistral" || provider === "openai" ? (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {provider === "mistral" ? (
                    <>
                      <SelectItem value="mistral-large-latest">mistral-large-latest</SelectItem>
                      <SelectItem value="mistral-medium-latest">mistral-medium-latest</SelectItem>
                      <SelectItem value="mistral-small-latest">mistral-small-latest</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                      <SelectItem value="text-embedding-3-large">text-embedding-3-large</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="config">Config JSON (optionnel)</Label>
            <Textarea
              id="config"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder='{"region":"eu-west-3"}'
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
            <RefreshCw className={`size-4 ${saving ? "animate-spin" : ""}`} />
            {isRotation ? "Roter la clé" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  api,
  provider,
  onClose,
}: {
  api: ApiClient;
  provider: ProviderName;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<RotationEvent[] | null>(null);

  useEffect(() => {
    api
      .get<{ events: RotationEvent[] }>(`/superadmin/ai-providers/${provider}/history`)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
  }, [api, provider]);

  const label = PROVIDER_META[provider].label;
  const actionMeta = useMemo(
    () => ({
      set: { label: "Configurée", variant: "default" as const },
      rotate: { label: "Rotation", variant: "secondary" as const },
      delete: { label: "Supprimée", variant: "destructive" as const },
    }),
    [],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" /> Historique — {label}
          </DialogTitle>
          <DialogDescription>
            Toutes les opérations sont écrites dans la table d'audit (`ai_provider.*`).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {events === null ? (
            <Skeleton className="h-24 w-full" />
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun événement pour ce provider.
            </p>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={actionMeta[e.action].variant} className="rounded-full text-[10px]">
                      {actionMeta[e.action].label}
                    </Badge>
                    <span className="text-sm font-medium">{e.actorName}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
