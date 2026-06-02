import type { ReactNode } from "react";

export function DataTable<T extends { id?: string } | Record<string, unknown>>({
  columns,
  rows,
  getKey,
  emptyState
}: {
  columns: Array<{ key: string; header: string; render?: (row: T) => ReactNode }>;
  rows: T[];
  getKey?: (row: T, index: number) => string;
  emptyState?: ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-mp border border-slate-200 bg-white p-6 shadow-sm">
        {emptyState ?? <p className="text-sm text-slate-500">Aucune donnee disponible pour le moment.</p>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-mp border border-slate-200 bg-white shadow-sm">
      <div className="mp-scrollbar overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="border-b border-slate-200 px-4 py-3 font-semibold">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={getKey?.(row, index) ?? String((row as { id?: string }).id ?? index)} className="border-b border-slate-100 last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 align-top break-words text-slate-700">
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
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
