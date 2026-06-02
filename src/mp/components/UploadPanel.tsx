import { FileUp, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { Button } from "@/components/ui/button";

export function UploadPanel({
  api,
  session,
  onUploaded,
}: {
  api: ApiClient;
  session: Session;
  onUploaded?: () => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const canUpload = session.user.role === "SUPER_ADMIN";

  async function upload(file: File | null) {
    if (!file || !canUpload) return;
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

  if (!canUpload) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled title="Réservé au Super Admin">
        <Lock size={15} />
        <span>Upload (Super Admin)</span>
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm" className="gap-2">
      <label className="cursor-pointer">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
        <span>{status || "Upload fichier"}</span>
        <input
          className="hidden"
          type="file"
          disabled={busy}
          onChange={(event) => upload(event.target.files?.[0] ?? null)}
        />
      </label>
    </Button>
  );
}
