import { Paperclip, TriangleAlert } from "lucide-react";

import { formatCents, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Statement } from "@/types/billing";

import { BalanceBadge } from "./balance-badge";

/**
 * Abrechnung über alle TOPs: je Kostenposition der Betrag, der Schlüssel und der
 * Anteil jeder TOP. Bleibt auch auf dem Handy eine Tabelle (seitlich scrollbar),
 * weil der Vergleich zwischen den Spalten der Zweck dieser Ansicht ist.
 */
export function StatementMatrix({ statement }: { statement: Statement }) {
  const units = statement.balances;
  const cell = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Kostenverteilung je TOP</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2.5 pr-3 pl-4 font-medium sm:pl-5">
              Position
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Betrag
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Schlüssel
            </th>
            {units.map((unit) => (
              <th key={unit.unitId} scope="col" className="px-3 py-2.5 text-right font-medium last:pr-5">
                {unit.unitName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {statement.lines.map((line) => (
            <tr key={line.costId} className="align-top">
              <th scope="row" className="py-2.5 pr-3 pl-4 text-left font-normal sm:pl-5">
                <span className="font-medium">{line.description}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {line.categoryName}
                  {line.documents.length > 0 ? (
                    <span
                      className="inline-flex items-center gap-0.5"
                      title={`${line.documents.length} Dokument(e)`}
                    >
                      <Paperclip className="size-3" aria-hidden />
                      {line.documents.length}
                      <span className="sr-only"> Dokumente</span>
                    </span>
                  ) : null}
                </span>
              </th>
              <td className={cell}>{formatCents(line.amountCents)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {line.keyName}
                {!line.distributable ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-warning">
                    <TriangleAlert className="size-3" aria-hidden />
                    Werte fehlen
                  </span>
                ) : line.keyUnitLabel ? (
                  <span className="block text-xs text-muted">
                    {formatNumber(line.totalWeight)} {line.keyUnitLabel}
                  </span>
                ) : null}
              </td>
              {units.map((unit) => {
                const share = line.shares.find((s) => s.unitId === unit.unitId);
                return (
                  <td key={unit.unitId} className={cn(cell, "last:pr-5", !share && "text-subtle")}>
                    {share ? formatCents(share.cents) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border-strong">
          <tr className="font-semibold">
            <th scope="row" className="py-2.5 pr-3 pl-4 text-left sm:pl-5">
              Kosten gesamt
            </th>
            <td className={cell}>{formatCents(statement.totalCostCents)}</td>
            <td />
            {units.map((unit) => (
              <td key={unit.unitId} className={cn(cell, "last:pr-5")}>
                {formatCents(unit.costCents)}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="py-2.5 pr-3 pl-4 text-left font-normal sm:pl-5">
              Einzahlungen
            </th>
            <td className={cell}>{formatCents(statement.totalPaymentCents)}</td>
            <td />
            {units.map((unit) => (
              <td key={unit.unitId} className={cn(cell, "last:pr-5")}>
                {formatCents(unit.paymentCents)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-border font-semibold">
            <th scope="row" className="py-3 pr-3 pl-4 text-left sm:pl-5">
              Saldo
            </th>
            <td />
            <td />
            {units.map((unit) => (
              <td key={unit.unitId} className={cn(cell, "py-3 last:pr-5")}>
                {formatCents(Math.abs(unit.balanceCents))}
                <span className="mt-1 flex justify-end">
                  <BalanceBadge cents={unit.balanceCents} />
                </span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
