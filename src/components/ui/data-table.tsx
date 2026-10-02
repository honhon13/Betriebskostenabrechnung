import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** false = Spalte erscheint nicht in der Handy-Karte (steht dort schon im Kopf). */
  mobile?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  /** Kopfzeile der Handy-Karte: links der Titel, rechts der wichtigste Wert. */
  mobileTitle: (row: T) => ReactNode;
  mobileValue?: (row: T) => ReactNode;
  /** Aktionen je Zeile (Bearbeiten, Löschen …). */
  actions?: (row: T) => ReactNode;
  footer?: ReactNode;
  caption: string;
  /** Hebt Zeilen hervor, z. B. die Position, zu der ein Link geführt hat. */
  highlight?: (row: T) => boolean;
}

/**
 * Ab md eine Tabelle, darunter eine Kartenliste – breite Tabellen müssen auf dem
 * Handy so nicht seitlich gescrollt werden.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  mobileTitle,
  mobileValue,
  actions,
  footer,
  caption,
  highlight,
}: DataTableProps<T>) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 font-medium first:pl-5 last:pr-5",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ))}
              {actions ? (
                <th scope="col" className="px-3 py-2.5 pr-5">
                  <span className="sr-only">Aktionen</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "align-top hover:bg-surface-muted/50",
                  highlight?.(row) && "bg-primary-soft hover:bg-primary-soft",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2.5 first:pl-5 last:pr-5",
                      column.align === "right" && "text-right tabular-nums",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {actions ? (
                  <td className="px-3 py-1.5 pr-5">
                    <div className="flex justify-end gap-1">{actions(row)}</div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          {footer ? <tfoot className="border-t border-border-strong">{footer}</tfoot> : null}
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn("px-4 py-3", highlight?.(row) && "bg-primary-soft")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-medium">{mobileTitle(row)}</div>
              {mobileValue ? (
                <div className="shrink-0 text-right font-semibold tabular-nums">
                  {mobileValue(row)}
                </div>
              ) : null}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns
                .filter((column) => column.mobile !== false)
                .map((column) => (
                  <div key={column.key} className="contents">
                    <dt className="text-muted">{column.header}</dt>
                    <dd className="min-w-0 text-right">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
            {actions ? <div className="mt-2 flex justify-end gap-1">{actions(row)}</div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
