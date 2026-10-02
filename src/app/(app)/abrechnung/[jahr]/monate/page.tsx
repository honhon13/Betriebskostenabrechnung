import type { Metadata } from "next";

import { can, getDataScope } from "@/auth/rbac";
import { MonthlyChart } from "@/components/billing/monthly-chart";
import { NavSelect } from "@/components/layout/year-select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NoAccess } from "@/components/ui/no-access";
import type { MonthRow } from "@/lib/billing/monthly";
import { formatCents } from "@/lib/format";
import { MONTH_NAMES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { listUnits } from "@/services/masterdata.service";
import { getMonthlyOverview } from "@/services/overview.service";
import { loadPeriodPage } from "@/services/page-context";

export const metadata: Metadata = { title: "Monatsübersicht" };

const ALL = "alle";

/** Vorzeichen sichtbar machen: Unterdeckung mit Minus, Überschuss mit Plus. */
function signed(cents: number): string {
  return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatCents(Math.abs(cents))}`;
}

export default async function MonthsPage({
  params,
  searchParams,
}: PageProps<"/abrechnung/[jahr]/monate">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "cost:read") || !can(user, "payment:read")) return <NoAccess />;

  const scope = getDataScope(user);
  const { top } = await searchParams;
  const units = await listUnits(user);
  const unit = scope.allUnits ? units.find((u) => String(u.number) === top) : undefined;
  const overview = await getMonthlyOverview(user, period, unit?.id);

  const subject = scope.allUnits ? (unit?.name ?? "Gesamtgebäude") : (user.unitName ?? "");
  const cell = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const row = (entry: MonthRow, label: string) => (
    <tr key={label} className={entry.month === null ? "text-muted" : undefined}>
      <th scope="row" className="py-2 pr-3 pl-4 text-left font-normal sm:pl-5">
        {label}
      </th>
      <td className={cell}>{formatCents(entry.costCents)}</td>
      <td className={cell}>{formatCents(entry.paymentCents)}</td>
      <td className={cell}>{signed(entry.differenceCents)}</td>
      <td className={cn(cell, "pr-4 font-medium sm:pr-5")}>{signed(entry.cumulativeCents)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Monatsübersicht ${period.year}`}
          description={`${subject} · Kosten nach Rechnungsdatum, eingegangene Einzahlungen nach Zahlungsdatum.`}
          action={
            scope.allUnits ? (
              <NavSelect
                label="TOP"
                value={unit ? String(unit.number) : ALL}
                options={[
                  { value: ALL, label: "Gesamtgebäude" },
                  ...units.map((u) => ({ value: String(u.number), label: u.name })),
                ]}
                hrefPattern={`/abrechnung/${period.year}/monate?top={value}`}
              />
            ) : null
          }
        />
        <CardContent>
          <MonthlyChart rows={overview.rows} />
        </CardContent>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">Kosten und Einzahlungen je Monat</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2.5 pr-3 pl-4 text-left font-medium sm:pl-5">
                  Monat
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Kosten
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Einzahlungen
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Differenz
                </th>
                <th scope="col" className="py-2.5 pr-4 pl-3 text-right font-medium sm:pr-5">
                  Aufgelaufen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.rows.map((entry) => row(entry, MONTH_NAMES[(entry.month ?? 1) - 1]))}
              {overview.other ? row(overview.other, "Ohne Datum / außerhalb des Jahres") : null}
            </tbody>
            <tfoot className="border-t-2 border-border-strong font-semibold">
              <tr>
                <th scope="row" className="py-2.5 pr-3 pl-4 text-left sm:pl-5">
                  Jahr {period.year}
                </th>
                <td className={cell}>{formatCents(overview.totalCostCents)}</td>
                <td className={cell}>{formatCents(overview.totalPaymentCents)}</td>
                <td className={cell}>
                  {signed(overview.totalPaymentCents - overview.totalCostCents)}
                </td>
                <td className={cn(cell, "pr-4 sm:pr-5")} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs text-subtle">
        Differenz = Einzahlungen minus Kosten. „Aufgelaufen“ ist der Stand seit Jahresbeginn: Plus
        bedeutet Guthaben, Minus eine Unterdeckung.
      </p>
    </div>
  );
}
