import { FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ApiClient } from "../api";
import { Button } from "@/components/ui/button";

export function UploadPanel({ api, onUploaded }: { api: ApiClient; onUploaded?: () => void }) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setStatus("Upload en cours…");
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/admin/kb/upload", form);
      setStatus("Document indexé");
      onUploaded?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button asChild variant="outline" size="sm" className="gap-2">
      <label className="cursor-pointer">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
        <span>{status || "Upload fichier"}</span>
        <input
          className="hidden"
          type="file"
          onChange={(event) => upload(event.target.files?.[0] ?? null)}
        />
      </label>
    </Button>
  );
}
