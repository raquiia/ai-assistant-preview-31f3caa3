import { FileUp } from "lucide-react";
import { useState } from "react";
import type { ApiClient } from "../api";

export function UploadPanel({ api, onUploaded }: { api: ApiClient; onUploaded?: () => void }) {
  const [status, setStatus] = useState<string>("");

  async function upload(file: File | null) {
    if (!file) return;
    setStatus("Upload...");
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/admin/kb/upload", form);
      setStatus("Document indexe");
      onUploaded?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload impossible");
    }
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-mp border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-mp-cyan hover:text-slate-800">
      <FileUp size={17} className="text-mp-blue" />
      <span className="hidden sm:inline">Upload</span>
      <input className="hidden" type="file" onChange={(event) => upload(event.target.files?.[0] ?? null)} />
      {status && <span className="ml-auto hidden max-w-40 truncate text-xs text-slate-400 sm:inline">{status}</span>}
    </label>
  );
}
