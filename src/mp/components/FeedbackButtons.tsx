import { RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { FeedbackRating } from "../shared";
import type { ApiClient } from "../api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FeedbackButtons({ api, responseId, onRetry }: { api: ApiClient; responseId?: string; onRetry?: () => Promise<void> }) {
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState<FeedbackRating | null>(null);

  async function rate(rating: FeedbackRating) {
    if (!responseId) return;
    try {
      const payload = await api.post<{ retryAvailable: boolean }>(`/chat/responses/${responseId}/feedback`, { rating });
      setRetryAvailable(payload.retryAvailable);
      setRated(rating);
      toast.success("Merci pour le retour");
    } catch {
      toast.error("Feedback non enregistré");
    }
  }

  async function retry() {
    if (!onRetry) return;
    setBusy(true);
    try { await onRetry(); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        onClick={() => rate("UP")}
        className={`size-8 ${rated === "UP" ? "border-success/40 bg-success/10 text-success" : ""}`}
        title="Bonne réponse"
      >
        <ThumbsUp className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => rate("DOWN")}
        className={`size-8 ${rated === "DOWN" ? "border-destructive/40 bg-destructive/10 text-destructive" : ""}`}
        title="Mauvaise réponse"
      >
        <ThumbsDown className="size-3.5" />
      </Button>
      {retryAvailable && (
        <Button variant="outline" size="sm" onClick={retry} disabled={busy} className="h-8 gap-1.5">
          <RotateCcw className="size-3.5" /> Régénérer
        </Button>
      )}
    </div>
  );
}
