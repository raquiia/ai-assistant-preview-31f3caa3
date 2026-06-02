import { RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { FeedbackRating } from "../shared";
import type { ApiClient } from "../api";

export function FeedbackButtons({ api, responseId, onRetry }: { api: ApiClient; responseId?: string; onRetry?: () => Promise<void> }) {
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rate(rating: FeedbackRating) {
    if (!responseId) return;
    const payload = await api.post<{ retryAvailable: boolean }>(`/chat/responses/${responseId}/feedback`, { rating });
    setRetryAvailable(payload.retryAvailable);
  }

  async function retry() {
    if (!onRetry) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="grid h-10 w-10 place-items-center rounded-mp border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:text-emerald-600" title="Bonne reponse" aria-label="Bonne reponse" onClick={() => rate("UP")}>
        <ThumbsUp size={16} />
      </button>
      <button className="grid h-10 w-10 place-items-center rounded-mp border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:text-red-600" title="Mauvaise reponse" aria-label="Mauvaise reponse" onClick={() => rate("DOWN")}>
        <ThumbsDown size={16} />
      </button>
      {retryAvailable && (
        <button className="flex h-10 items-center gap-2 rounded-mp border border-mp-blue bg-blue-50 px-3 text-sm font-medium text-mp-blue transition hover:bg-blue-100 disabled:opacity-60" disabled={busy} onClick={retry}>
          <RotateCcw size={15} />
          Regenerer avec GPT-5.5
        </button>
      )}
    </div>
  );
}
