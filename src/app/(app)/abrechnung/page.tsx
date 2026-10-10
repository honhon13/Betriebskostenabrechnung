import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { AnnualStatementButton } from "@/components/billing/annual-statement-button";
import { BalanceBadge } from "@/components/billing/balance-badge";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSelect } from "@/components/filters/filter-controls";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { countActive, readMapped, readNumber } from "@/lib/filters";
import { formatCents, formatCredit } from "@/lib/format";
import { filterYears, type YearFilter } from "@/lib/list-filters";
import { listUnits } from "@/services/masterdata.service";
import { getYearOverview, type YearSummary } from "@/services/overview.service";

export const metadata: Metadata = { title: "Abrechnung" };

/** Status der Abrechnung in der URL (?status=entwurf). */
const STATUS_PARAMS = { draft: "entwurf", released: "freigegeben" } as const;

/** Jahresübersicht: alle sichtbaren Abrechnungsjahre mit Kosten, Einzahlungen und Differenz. */
export default async function BillingIndexPage({ searchParams }: PageProps<"/abrechnung">) {
  const user = await requireUser();
  if (!can(user, "period:read") || !can(user, "cost:read")) return <NoAccess />;

  const own = !getDataScope(user).allUnits;
  // Die Verwaltung kann die Jahresabrechnung auch je TOP erstellen.
  const [allYears, units] = await Promise.all([getYearOverview(user), own ? [] : listUnits(user)]);
  const canCreate = can(user, "period:write");

  // Filter in der URL: Status (nur wer Entwürfe sieht) und Zeitraum von Jahr bis Jahr.
  const query = await searchParams;
  const seesDrafts = getDataScope(user).includeDrafts;
  const known = allYears.map((y) => y.period.year);
  const filter: YearFilter = {
    status: seesDrafts ? readMapped(query, "status", STATUS_PARAMS) : undefined,
    fromYear: known.find((year) => year === readNumber(query, "von")),
    toYear: known.find((year) => year === readNumber(query, "bis")),
  };
  const activeFilters = countActive(Object.values(filter));
  const years = filterYears(allYears, filter);
  const yearOptions = [...known].sort((a, b) => b - a).map((year) => ({ value: year, label: String(year) }));

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
      key: "costs",
      header: "Kosten",
      align: "right",
      cell: (y) => formatCents(y.costBeforeCreditsCents),
    },
    {
      key: "credits",
      header: "Gutschriften",
      align: "right",
      cell: (y) => (
        <>
          {formatCredit(y.creditCents)}
          {y.creditCount > 0 ? (
            <span className="ml-1 text-xs text-muted">({y.creditCount})</span>
          ) : null}
        </>
      ),
    },
    {
      key: "cost",
      header: own ? "Mein Kostenanteil" : "Nettokosten",
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
          years={allYears.map((y) => ({ year: y.period.year, released: y.period.status === "released" }))}
          units={units.map((unit) => ({ number: unit.number, name: unit.name }))}
        />
        <AddButton user={user} area="billing" />
      </PageHeader>

      <Card>
        {allYears.length === 0 ? (
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
              description="Kosten abzüglich Gutschriften = Nettokosten; Einzahlungen minus Nettokosten = Guthaben bzw. Nachzahlung. Ein Klick auf das Jahr öffnet die Details."
            />
            {allYears.length > 1 ? (
              <FilterBar action="/abrechnung" activeCount={activeFilters} className="mt-3 border-t">
                {seesDrafts ? (
                  <FilterSelect
                    name="status"
                    label="Status"
                    value={filter.status && STATUS_PARAMS[filter.status]}
                    allLabel="Entwurf und freigegeben"
                    options={[
                      { value: STATUS_PARAMS.draft, label: "Entwurf" },
                      { value: STATUS_PARAMS.released, label: "Freigegeben" },
                    ]}
                  />
                ) : null}
                <FilterSelect
                  name="von"
                  label="Von Jahr"
                  value={filter.fromYear}
                  allLabel="Beginn"
                  options={yearOptions}
                />
                <FilterSelect
                  name="bis"
                  label="Bis Jahr"
                  value={filter.toYear}
                  allLabel="Heute"
                  options={yearOptions}
                />
              </FilterBar>
            ) : null}
            {years.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted sm:px-5">
                Keine Treffer für diese Filter.
              </p>
            ) : null}
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
