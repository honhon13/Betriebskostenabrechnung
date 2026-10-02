import { ChevronDown, CircleCheck, CircleX, Clock } from "lucide-react";
import Link from "next/link";

import { DocumentChips } from "@/components/documents/document-preview";
import { CoverageMeter } from "@/components/dashboard/coverage-meter";
import { formatCents, formatDate, formatNumber } from "@/lib/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { PaymentDto, StatementLine, UnitBalance } from "@/types/billing";

import { BalanceBadge } from "./balance-badge";

interface UnitStatementProps {
  year: number;
  balance: UnitBalance;
  /** Kostenpositionen, an denen die TOP beteiligt ist. */
  lines: StatementLine[];
  /** Einzahlungen der TOP im Abrechnungsjahr (alle Status). */
  payments: PaymentDto[];
  /** Link zu allen Dokumenten der TOP – nur für die Verwaltung sinnvoll. */
  documentsHref?: string;
  defaultOpen?: boolean;
  /** Hebt eine Kostenposition hervor (Sprungziel aus der Dokumentenverwaltung). */
  highlightCostId?: number;
}

const STATUS_ICON = { received: CircleCheck, pending: Clock, cancelled: CircleX } as const;

/**
 * Abrechnung einer TOP: Kostenanteil, Einzahlungen und Differenz, darunter die
 * zugehörigen Kostenpositionen mit Belegen und die Einzahlungen mit Nachweisen.
 */
export function UnitStatement({
  year,
  balance,
  lines,
  payments,
  documentsHref,
  defaultOpen = false,
  highlightCostId,
}: UnitStatementProps) {
  const shareOf = (line: StatementLine) => line.shares.find((s) => s.unitId === balance.unitId);
  const cell = "px-3 py-2 align-top";
  const number = cn(cell, "text-right tabular-nums whitespace-nowrap");

  return (
    <details
      open={defaultOpen || undefined}
      className="group rounded-xl border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-ring sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-24 items-center gap-2 text-base font-semibold">
          <ChevronDown
            className="size-4 text-muted transition-transform group-open:rotate-180"
            aria-hidden
          />
          {balance.unitName}
        </span>
        <dl className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-muted">Kostenanteil</dt>
            <dd className="font-medium tabular-nums">{formatCents(balance.costCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Einzahlungen</dt>
            <dd className="font-medium tabular-nums">{formatCents(balance.paymentCents)}</dd>
          </div>
          <div className="ml-auto text-right">
            <dt className="text-xs text-muted">Differenz</dt>
            <dd className="flex items-center gap-2 font-semibold tabular-nums">
              {formatCents(Math.abs(balance.balanceCents))}
              <BalanceBadge cents={balance.balanceCents} />
            </dd>
          </div>
        </dl>
      </summary>

      <div className="space-y-5 border-t border-border px-4 py-4 sm:px-5">
        <CoverageMeter paymentCents={balance.paymentCents} costCents={balance.costCents} />

        <section>
          <h3 className="text-sm font-semibold">Kostenpositionen</h3>
          {lines.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Keine Kostenpositionen für {balance.unitName}.</p>
          ) : (
            <div className="-mx-4 mt-2 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">Kostenpositionen {balance.unitName}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 pl-4 font-medium sm:pl-5">
                      Position
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Gesamt
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Umlageschlüssel
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Belege
                    </th>
                    <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium sm:pr-5">
                      Anteil
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line) => {
                    const share = shareOf(line);
                    return (
                      <tr
                        key={line.costId}
                        className={line.costId === highlightCostId ? "bg-primary-soft" : undefined}
                      >
                        <th scope="row" className="py-2 pr-3 pl-4 text-left align-top font-normal sm:pl-5">
                          <span className="font-medium">{line.description}</span>
                          <span className="block text-xs text-muted">
                            {[line.categoryName, line.costDate && formatDate(line.costDate)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </th>
                        <td className={number}>{formatCents(line.amountCents)}</td>
                        <td className={cell}>
                          {line.keyName}
                          {line.distributable && line.keyUnitLabel && share ? (
                            <span className="block text-xs whitespace-nowrap text-muted">
                              {formatNumber(share.weight)} von {formatNumber(line.totalWeight)}{" "}
                              {line.keyUnitLabel}
                            </span>
                          ) : null}
                        </td>
                        <td className={cell}>
                          <DocumentChips documents={line.documents} />
                        </td>
                        <td className={cn(number, "pr-4 font-medium sm:pr-5")}>
                          {formatCents(share?.cents ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border-strong font-semibold">
                  <tr>
                    <th scope="row" colSpan={4} className="py-2 pr-3 pl-4 text-left sm:pl-5">
                      Kostenanteil {balance.unitName}
                    </th>
                    <td className={cn(number, "pr-4 sm:pr-5")}>{formatCents(balance.costCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Einzahlungen</h3>
          {payments.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Keine Einzahlungen im Abrechnungsjahr {year}.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {payments.map((payment) => {
                const Icon = STATUS_ICON[payment.status];
                return (
                  <li
                    key={payment.id}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm",
                      payment.status !== "received" && "text-muted",
                    )}
                  >
                    <span className="w-20 shrink-0 tabular-nums">{formatDate(payment.paymentDate)}</span>
                    <span className="min-w-0 flex-1 truncate">{payment.purpose ?? "Einzahlung"}</span>
                    <DocumentChips documents={payment.documents} empty="" />
                    {payment.status !== "received" ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Icon className="size-3.5" aria-hidden />
                        {PAYMENT_STATUS_LABELS[payment.status]}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "ml-auto font-medium tabular-nums",
                        payment.status === "cancelled" && "line-through",
                      )}
                    >
                      {formatCents(payment.amountCents)}
                    </span>
                  </li>
                );
              })}
              <li className="flex justify-between gap-4 px-3 py-2 text-sm font-semibold">
                <span>Eingegangen</span>
                <span className="tabular-nums">{formatCents(balance.paymentCents)}</span>
              </li>
            </ul>
          )}
        </section>

        {documentsHref ? (
          <p className="text-sm">
            <Link href={documentsHref} className="font-medium text-primary underline-offset-4 hover:underline">
              Alle Dokumente {balance.unitName} im Jahr {year}
            </Link>
          </p>
        ) : null}
      </div>
    </details>
  );
}
