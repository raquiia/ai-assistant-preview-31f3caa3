import { Factory, GitBranch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  INDUSTRIES,
  PM_DOMAINS,
  labelForIndustry,
  labelForPmDomain,
  type ChatFilters as Filters,
} from "../shared";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  compact?: boolean;
}

export function ChatFiltersBar({ filters, onChange, compact }: Props) {
  const hasAny = filters.industryTags.length > 0 || filters.pmDomainTags.length > 0;

  function toggle(list: "industryTags" | "pmDomainTags", value: string) {
    const set = new Set(filters[list]);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange({ ...filters, [list]: Array.from(set) });
  }
  function clearAll() {
    onChange({ industryTags: [], pmDomainTags: [] });
  }
  function clearOne(list: "industryTags" | "pmDomainTags") {
    onChange({ ...filters, [list]: [] });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterPopover
        icon={<Factory className="size-3.5" />}
        label="Secteur"
        emptyLabel="Tous secteurs"
        selected={filters.industryTags}
        getLabel={labelForIndustry}
        onClear={() => clearOne("industryTags")}
        compact={compact}
      >
        <FilterList
          options={INDUSTRIES}
          selected={filters.industryTags}
          onToggle={(v) => toggle("industryTags", v)}
        />
      </FilterPopover>

      <FilterPopover
        icon={<GitBranch className="size-3.5" />}
        label="Domaine PM"
        emptyLabel="Tous domaines"
        selected={filters.pmDomainTags}
        getLabel={labelForPmDomain}
        onClear={() => clearOne("pmDomainTags")}
        compact={compact}
      >
        <FilterList
          options={PM_DOMAINS}
          selected={filters.pmDomainTags}
          onToggle={(v) => toggle("pmDomainTags", v)}
        />
      </FilterPopover>

      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-7 px-2 text-[11px] text-muted-foreground"
        >
          <X className="mr-1 size-3" /> Réinitialiser
        </Button>
      )}
    </div>
  );
}

function FilterPopover({
  icon,
  label,
  emptyLabel,
  selected,
  getLabel,
  onClear,
  compact,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  emptyLabel: string;
  selected: string[];
  getLabel: (v: string) => string;
  onClear: () => void;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const count = selected.length;
  const summary =
    count === 0
      ? emptyLabel
      : count <= 2
        ? selected.map(getLabel).join(", ")
        : `${getLabel(selected[0]!)} +${count - 1}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 gap-1.5 text-[11px] ${count > 0 ? "border-primary/40 bg-primary/5 text-foreground" : "text-muted-foreground"}`}
        >
          {icon}
          <span className={compact ? "max-w-[120px] truncate" : "max-w-[180px] truncate"}>
            <span className="font-medium text-foreground/80">{label}:</span>{" "}
            <span>{summary}</span>
          </span>
          {count > 0 && (
            <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[9px]">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs font-semibold">{label}</p>
          {count > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Effacer
            </button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1">{children}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function FilterList({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        return (
          <li key={opt.value}>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                checked ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
              }`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(opt.value)}
                className="size-3.5"
              />
              <span className="flex-1">{opt.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
