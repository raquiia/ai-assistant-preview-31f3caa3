import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable<T>({
  columns,
  rows,
  getKey,
  emptyState,
  onRowClick,
}: {
  columns: Array<{ key: string; header: string; render?: (row: T) => ReactNode; className?: string }>;
  rows: T[];
  getKey?: (row: T, index: number) => string;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
        {emptyState ?? (
          <p className="text-sm text-muted-foreground">Aucune donnée disponible pour le moment.</p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="mp-scrollbar overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {columns.map((column) => (
                <th key={column.key} className={cn("px-5 py-3", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={getKey?.(row, index) ?? String((row as { id?: string }).id ?? index)}
                className={cn(
                  "border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30",
                  onRowClick && "cursor-pointer",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn("px-5 py-3.5 align-top text-foreground/90", column.className)}
                  >
                    {column.render
                      ? column.render(row)
                      : String((row as Record<string, unknown>)[column.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
