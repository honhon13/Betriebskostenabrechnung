import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { BalanceBadge } from "@/components/billing/balance-badge";
import { NewPeriodDialog } from "@/components/billing/new-period-dialog";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents } from "@/lib/format";
import { getYearOverview, type YearSummary } from "@/services/overview.service";

export const metadata: Metadata = { title: "Abrechnung" };

/** Jahresübersicht: alle sichtbaren Abrechnungsjahre mit Kosten, Einzahlungen und Differenz. */
export default async function BillingIndexPage() {
  const user = await requireUser();
  if (!can(user, "period:read") || !can(user, "cost:read")) return <NoAccess />;

  const years = await getYearOverview(user);
  const own = !getDataScope(user).allUnits;
  const canCreate = can(user, "period:write");
  const suggestedYear =
    years.length > 0 ? Math.max(...years.map((y) => y.period.year)) + 1 : new Date().getFullYear();

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
        {canCreate && years.length > 0 ? (
          <NewPeriodDialog suggestedYear={suggestedYear} variant="primary" />
        ) : null}
      </PageHeader>

      <Card>
        {years.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={canCreate ? "Noch kein Abrechnungsjahr" : "Noch keine freigegebene Abrechnung"}
            description={
              canCreate
                ? "Lege das erste Abrechnungsjahr an, um Kosten, Umlageschlüssel und Dokumente zu erfassen."
                : "Sobald die Verwaltung eine Abrechnung freigibt, erscheint sie hier."
            }
          >
            {canCreate ? <NewPeriodDialog suggestedYear={suggestedYear} variant="primary" /> : null}
          </EmptyState>
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
