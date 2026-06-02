import { useEffect, useState } from "react";
import { Cpu, Lock, Zap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ApiClient } from "../api";

interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  tier: "fast" | "balanced" | "premium";
  contextWindow: number;
  pricePer1kIn: number;
  pricePer1kOut: number;
  allowed: boolean;
}

interface ModelsPayload {
  defaultModel: string | null;
  models: ModelInfo[];
  restricted: ModelInfo[];
  quotas: { rpm: number; tpm: number };
}

const STORAGE_KEY = "mp.chat.selectedModel.v1";

export function ModelSelector({
  api,
  value,
  onChange,
  compact = false,
}: {
  api: ApiClient;
  value?: string;
  onChange?: (modelId: string) => void;
  compact?: boolean;
}) {
  const [payload, setPayload] = useState<ModelsPayload | null>(null);
  const [internal, setInternal] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  });

  useEffect(() => {
    api
      .get<ModelsPayload>("/me/models")
      .then((p) => {
        setPayload(p);
        if (!value && !internal && p.defaultModel) {
          setInternal(p.defaultModel);
          onChange?.(p.defaultModel);
        }
      })
      .catch(() => setPayload(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const current = value ?? internal;

  const handle = (id: string) => {
    setInternal(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {}
    onChange?.(id);
  };

  if (!payload) return null;

  return (
    <Select value={current} onValueChange={handle}>
      <SelectTrigger className={compact ? "h-8 w-[200px] text-xs" : "w-[260px]"}>
        <div className="flex items-center gap-1.5">
          <Cpu className="size-3.5 text-primary" />
          <SelectValue placeholder="Modèle" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="flex items-center justify-between">
            <span>Autorisés ({payload.models.length})</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {payload.quotas.rpm} rpm
            </span>
          </SelectLabel>
          {payload.models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <div className="flex items-center gap-2">
                <span>{m.label}</span>
                <Badge variant="outline" className="text-[9px] px-1 h-4">
                  {m.tier === "fast" && <Zap size={8} className="mr-0.5" />}
                  {m.tier}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">
                  ${(m.pricePer1kIn * 1000).toFixed(2)}/M in
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
        {payload.restricted.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-muted-foreground">Restreints</SelectLabel>
            {payload.restricted.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled>
                <div className="flex items-center gap-2 opacity-60">
                  <Lock size={10} />
                  <span>{m.label}</span>
                  <span className="text-[10px]">— rôle requis</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
