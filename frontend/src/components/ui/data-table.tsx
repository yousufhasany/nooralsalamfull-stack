import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  /** Hide on small screens (the cell is still available in the row details). */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: string;
  dense?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-sand-200 bg-white shadow-soft">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-sand-200 bg-sand-50 text-xs uppercase tracking-wide text-ink-500">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("px-4 py-3 font-medium", c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start", c.hideOnMobile && "hidden md:table-cell", c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-200">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-sand-50/70">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(dense ? "px-4 py-2" : "px-4 py-3", "align-middle", c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start", c.hideOnMobile && "hidden md:table-cell", c.className)}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
