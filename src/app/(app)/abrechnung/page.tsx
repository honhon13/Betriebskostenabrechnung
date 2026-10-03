import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { AnnualStatementButton } from "@/components/billing/annual-statement-button";
import { BalanceBadge } from "@/components/billing/balance-badge";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents } from "@/lib/format";
import { listUnits } from "@/services/masterdata.service";
import { getYearOverview, type YearSummary } from "@/services/overview.service";

export const metadata: Metadata = { title: "Abrechnung" };

/** Jahresübersicht: alle sichtbaren Abrechnungsjahre mit Kosten, Einzahlungen und Differenz. */
export default async function BillingIndexPage() {
  const user = await requireUser();
  if (!can(user, "period:read") || !can(user, "cost:read")) return <NoAccess />;

  const own = !getDataScope(user).allUnits;
  // Die Verwaltung kann die Jahresabrechnung auch je TOP erstellen.
  const [years, units] = await Promise.all([getYearOverview(user), own ? [] : listUnits(user)]);
  const canCreate = can(user, "period:write");

  const yearLink = (summary: YearSummary) => (
    <Link
      href={`/abrechnung/${summary.period.year}`}
      className="font-semibold underline-offset-4 hover:underline"
    >
      {summary.period.year}
    </Link>
  );

  const columns: Column<YearSummary>[] = [
    { key: "year", header: "Abrechnungsjahr", mobile: false, cell: yearLink },
    { key: "status", header: "Status", cell: (y) => <PeriodStatusBadge status={y.period.status} /> },
    { key: "count", header: "Positionen", align: "right", cell: (y) => y.costCount },
    {
      key: "cost",
      header: own ? "Mein Kostenanteil" : "Gesamtkosten",
      align: "right",
      cell: (y) => formatCents(y.costCents),
    },
    {
      key: "payments",
      header: own ? "Meine Einzahlungen" : "Einzahlungen",
      align: "right",
      cell: (y) => formatCents(y.paymentCents),
    },
    {
      key: "balance",
      header: "Differenz",
      align: "right",
      mobile: false,
      cell: (y) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          <span className="font-medium">{formatCents(Math.abs(y.balanceCents))}</span>
          <BalanceBadge cents={y.balanceCents} />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abrechnung"
        description={
          own
            ? `Freigegebene Abrechnungen ${user.unitName ?? ""}`.trim()
            : "Jahresübersicht über alle Abrechnungsjahre."
        }
      >
        <AnnualStatementButton
          years={years.map((y) => ({ year: y.period.year, released: y.period.status === "released" }))}
          units={units.map((unit) => ({ number: unit.number, name: unit.name }))}
        />
        <AddButton user={user} area="billing" />
      </PageHeader>

      <Card>
        {years.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={canCreate ? "Noch kein Abrechnungsjahr" : "Noch keine freigegebene Abrechnung"}
            description={
              canCreate
                ? "Lege über „Hinzufügen“ das erste Abrechnungsjahr an, um Kosten, Umlageschlüssel und Dokumente zu erfassen."
                : "Sobald die Verwaltung eine Abrechnung freigibt, erscheint sie hier."
            }
          />
        ) : (
          <>
            <CardHeader
              title="Jahresübersicht"
              description="Einzahlungen minus Kosten = Guthaben bzw. Nachzahlung. Ein Klick auf das Jahr öffnet die Details."
            />
            <div className="pt-3">
              <DataTable
                caption="Abrechnungsjahre"
                rows={years}
                columns={columns}
                rowKey={(y) => y.period.id}
                mobileTitle={yearLink}
                mobileValue={(y) => (
                  <span className="inline-flex flex-col items-end gap-1">
                    {formatCents(Math.abs(y.balanceCents))}
                    <BalanceBadge cents={y.balanceCents} />
                  </span>
                )}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
