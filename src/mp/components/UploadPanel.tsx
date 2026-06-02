import { FileUp, Loader2, Lock, Tag } from "lucide-react";
import { useRef, useState } from "react";
import type { ApiClient } from "../api";
import type { Session } from "../types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { INDUSTRIES, PM_DOMAINS, labelForIndustry, labelForPmDomain } from "../shared";

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
  const [industryTags, setIndustryTags] = useState<string[]>([]);
  const [pmDomainTags, setPmDomainTags] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const canUpload = session.user.role === "SUPER_ADMIN";
  const tagCount = industryTags.length + pmDomainTags.length;

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function upload(file: File | null) {
    if (!file || !canUpload) return;
    setBusy(true);
    setStatus("Upload en cours…");
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name);
    industryTags.forEach((t) => form.append("industryTags", t));
    pmDomainTags.forEach((t) => form.append("pmDomainTags", t));
    try {
      await api.post("/admin/kb/upload", form);
      setStatus("Document indexé");
      onUploaded?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload impossible");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Tag size={14} />
            <span className="text-xs">
              {tagCount === 0 ? "Document générique" : `${tagCount} tag${tagCount > 1 ? "s" : ""}`}
            </span>
            {tagCount > 0 && (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">
                {tagCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold">Tags du document</p>
            <p className="text-[10px] text-muted-foreground">
              Sans tag = document générique (toujours candidat au retrieval).
            </p>
          </div>
          <ScrollArea className="max-h-80">
            <div className="p-3 space-y-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Secteurs
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {INDUSTRIES.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60">
                      <Checkbox
                        checked={industryTags.includes(opt.value)}
                        onCheckedChange={() => toggle(industryTags, setIndustryTags, opt.value)}
                        className="size-3.5"
                      />
                      <span className="truncate">{labelForIndustry(opt.value)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Domaines PM
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {PM_DOMAINS.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60">
                      <Checkbox
                        checked={pmDomainTags.includes(opt.value)}
                        onCheckedChange={() => toggle(pmDomainTags, setPmDomainTags, opt.value)}
                        className="size-3.5"
                      />
                      <span className="truncate">{labelForPmDomain(opt.value)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Button asChild variant="outline" size="sm" className="gap-2">
        <label className="cursor-pointer">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
          <span>{status || "Upload fichier"}</span>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            disabled={busy}
            onChange={(event) => upload(event.target.files?.[0] ?? null)}
          />
        </label>
      </Button>
    </div>
  );
}
