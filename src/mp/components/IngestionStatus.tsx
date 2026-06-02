import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ApiClient } from "../api";

interface StateStep {
  name: string;
  status: "SUCCEEDED" | "RUNNING" | "PENDING" | "FAILED";
  startedAt: number | null;
  durationMs: number | null;
}

interface ExecutionPayload {
  documentId: string;
  executionArn: string;
  stateMachine: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  states: StateStep[];
  progress: number;
  cost: { textractPages: number; embeddingsTokens: number; estimatedUsd: number };
}

function StepIcon({ status }: { status: StateStep["status"] }) {
  if (status === "SUCCEEDED") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "RUNNING") return <Loader2 className="size-4 text-primary animate-spin" />;
  if (status === "FAILED") return <XCircle className="size-4 text-destructive" />;
  return <Circle className="size-4 text-muted-foreground/40" />;
}

export function IngestionStatus({
  api,
  documentId,
  compact = false,
}: {
  api: ApiClient;
  documentId: string;
  compact?: boolean;
}) {
  const [exec, setExec] = useState<ExecutionPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .get<ExecutionPayload>(`/admin/kb/documents/${documentId}/execution`)
        .then((p) => !cancelled && setExec(p))
        .catch(() => undefined);
    };
    load();
    const i = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [api, documentId]);

  if (!exec) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className={exec.status === "RUNNING" ? "size-3 animate-spin text-primary" : "hidden"} />
        <Progress value={Math.round(exec.progress * 100)} className="h-1.5 w-24" />
        <span className="text-[10px] text-muted-foreground font-mono">
          {Math.round(exec.progress * 100)}%
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Step Functions · {exec.stateMachine}
            <Badge
              variant={exec.status === "SUCCEEDED" ? "secondary" : exec.status === "FAILED" ? "destructive" : "default"}
              className="text-[10px]"
            >
              {exec.status}
            </Badge>
          </p>
          <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[400px]">
            {exec.executionArn}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Démarré {new Date(exec.startedAt).toLocaleTimeString("fr-FR")}</p>
          <p className="font-mono">~${exec.cost.estimatedUsd.toFixed(2)}</p>
        </div>
      </div>

      <Progress value={Math.round(exec.progress * 100)} className="h-2" />

      <ol className="relative space-y-2 border-l-2 border-muted pl-4">
        {exec.states.map((s) => (
          <li key={s.name} className="flex items-center gap-3 -ml-[1.4rem]">
            <div className="bg-background">
              <StepIcon status={s.status} />
            </div>
            <div className="flex-1 flex items-center justify-between">
              <span
                className={
                  s.status === "RUNNING"
                    ? "text-sm font-medium text-primary"
                    : s.status === "PENDING"
                      ? "text-sm text-muted-foreground"
                      : "text-sm"
                }
              >
                {s.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : s.status === "RUNNING" ? "…" : ""}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-2 border-t pt-2 text-[11px]">
        <div>
          <p className="text-muted-foreground">Textract</p>
          <p className="font-mono">{exec.cost.textractPages} pages</p>
        </div>
        <div>
          <p className="text-muted-foreground">Embeddings</p>
          <p className="font-mono">{exec.cost.embeddingsTokens.toLocaleString()} tk</p>
        </div>
        <div>
          <p className="text-muted-foreground">Coût</p>
          <p className="font-mono">${exec.cost.estimatedUsd.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
