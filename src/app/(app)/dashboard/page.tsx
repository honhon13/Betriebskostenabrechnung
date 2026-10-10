import {
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  FileMinus,
  FileQuestion,
  FileText,
  Files,
  Hourglass,
  PieChart,
  ReceiptText,
  Scale,
  Sigma,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { AccountSummaryTable } from "@/components/account/account-parts";
import { AddButton } from "@/components/add/add-button";
import { BalanceBadge, balanceLabel } from "@/components/billing/balance-badge";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { CategoryBars } from "@/components/dashboard/category-bars";
import { CostTrendChart } from "@/components/dashboard/cost-trend-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { DocumentPreviewButton } from "@/components/documents/document-preview";
import { NavSelect, YearSelect } from "@/components/layout/year-select";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { rowLinkClass } from "@/components/ui/interactive";
import { MaybeLink } from "@/components/ui/maybe-link";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { monthRange, withParams } from "@/lib/filters";
import {
  creditCountLabel,
  formatCents,
  formatCredit,
  formatDate,
  formatDateTime,
  formatPercent,
} from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getAccountOverview } from "@/services/account.service";
import { getDashboard, type Activity } from "@/services/dashboard.service";
import { listUnits } from "@/services/masterdata.service";
import { getCostTrend } from "@/services/overview.service";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";
import { countOwnOpenSubmissions, countPendingReviews } from "@/services/review.service";

export const metadata: Metadata = { title: "Dashboard" };

const ACTIVITY_ICON: Record<Activity["kind"], LucideIcon> = {
  cost: ReceiptText,
  credit: FileMinus,
  payment: Wallet,
  document: FileText,
};

const ACTIVITY_LABEL: Record<Activity["kind"], string> = {
  cost: "Kosten erfasst",
  credit: "Gutschrift erfasst",
  payment: "Einzahlung erfasst",
  document: "Dokument hochgeladen",
};

/** Wert von ?verlauf= für die Ansicht über alle Abrechnungsjahre. */
const TREND_ALL = "jahre";

interface OpenRow {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  if (!can(user, "dashboard:view") || !can(user, "period:read")) return <NoAccess />;

  const { jahr, verlauf } = await searchParams;
  const periods = await listPeriods(user);
  const period = periods.find((p) => p.year === Number(jahr)) ?? pickDefaultPeriod(periods);
  const scope = getDataScope(user);

  if (!period) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard">
          <AddButton user={user} area="dashboard" />
        </PageHeader>
        <Card>
          <EmptyState
            icon={CalendarPlus}
            title={scope.includeDrafts ? "Noch kein Abrechnungsjahr" : "Noch keine freigegebene Abrechnung"}
            description={
              scope.includeDrafts
                ? "Lege über „Hinzufügen“ das erste Abrechnungsjahr an, um Kosten und Einzahlungen zu erfassen."
                : "Sobald die Verwaltung eine Abrechnung freigibt, erscheint sie hier."
            }
          />
        </Card>
      </div>
    );
  }

  // Zeitraum des Kostenverlaufs: ?verlauf=jahre zeigt alle Jahre, ?verlauf=2025 die Monate
  // dieses Jahres – ohne Angabe die Monate des oben gewählten Abrechnungsjahres.
  const trendPeriod =
    verlauf === TREND_ALL ? null : (periods.find((p) => String(p.year) === verlauf) ?? period);

  const reviews = can(user, "review:manage");
  const [data, trend, pendingReviews, ownOpen, account, units] = await Promise.all([
    getDashboard(user, period.id),
    can(user, "cost:read") ? getCostTrend(user, trendPeriod) : null,
    reviews ? countPendingReviews(user) : 0,
    reviews ? null : countOwnOpenSubmissions(user),
    can(user, "account:read") ? getAccountOverview(user) : null,
    listUnits(user),
  ]);
  // Die jüngsten Bewegungen über alle sichtbaren Konten – neueste zuerst.
  const recentMovements = (account?.units ?? [])
    .flatMap((unit) =>
      unit.movements.map((movement) => ({
        ...movement,
        unitId: unit.unitId,
        unitName: unit.unitName,
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 5);
  const own = !scope.allUnits;
  const year = period.year;
  const { openItems } = data;

  // Ziele der Verlinkungen. Jede Kennzahl führt zu der Ansicht, aus der sie stammt – mit dem
  // gewählten Jahr und, wo es eine gibt, der TOP als Filter. Verlinkt wird nur, was die Rolle
  // öffnen darf: die Kostenliste etwa sieht nur die Verwaltung, alle anderen ihre Abrechnung.
  const unitNumber = new Map(units.map((unit) => [unit.id, unit.number]));
  const canCosts = can(user, "cost:read");
  const canPayments = can(user, "payment:read");
  const canDocuments = can(user, "document:read");
  const statementHref = canCosts ? `/abrechnung/${year}` : undefined;
  const costsPath = `/abrechnung/${year}/kosten`;
  /** Kostenliste mit Filtern – für alle ohne Blick auf alle TOPs die eigene Abrechnung. */
  const costsHref = (filters: Record<string, string | number | undefined> = {}) =>
    !canCosts ? undefined : own ? statementHref : withParams(costsPath, filters);
  const paymentsHref = (filters: Record<string, string | number | undefined> = {}) =>
    canPayments ? withParams("/einzahlungen", { jahr: year, ...filters }) : undefined;
  const documentsHref = (filters: Record<string, string | number | undefined> = {}) =>
    canDocuments ? withParams("/dokumente", { jahr: year, ...filters }) : undefined;
  /** Abrechnung einer TOP: aufgeklappt und als Sprungziel. */
  const unitStatementHref = (unitId: number) =>
    !canCosts
      ? undefined
      : own
        ? statementHref
        : withParams(`/abrechnung/${year}#top-${unitNumber.get(unitId)}`, {
            top: unitNumber.get(unitId),
          });
  const accountHref = (unitId: number) =>
    own
      ? "/einzahlungen/konto"
      : withParams(`/einzahlungen/konto#konto-top-${unitNumber.get(unitId)}`, {
          top: unitNumber.get(unitId),
        });

  // Offene Positionen: nur Zeilen, bei denen wirklich etwas zu tun ist.
  const openRows: OpenRow[] = [
    ...(pendingReviews > 0
      ? [
          {
            icon: ClipboardCheck,
            label: `${pendingReviews === 1 ? "Eingereichter Eintrag wartet" : "Eingereichte Einträge warten"} auf Prüfung`,
            value: String(pendingReviews),
            href: "/pruefung",
          },
        ]
      : []),
    ...(ownOpen && ownOpen.pending > 0
      ? [
          {
            icon: Hourglass,
            label: `Eigene ${ownOpen.pending === 1 ? "Eingabe wartet" : "Eingaben warten"} auf Prüfung`,
            value: String(ownOpen.pending),
            href: "/eingaben?pruefung=ausstehend",
          },
        ]
      : []),
    ...(ownOpen && ownOpen.rejected > 0
      ? [
          {
            icon: CircleX,
            label: `Eigene ${ownOpen.rejected === 1 ? "Eingabe wurde" : "Eingaben wurden"} abgelehnt`,
            value: String(ownOpen.rejected),
            href: "/eingaben?pruefung=abgelehnt",
          },
        ]
      : []),
    ...openItems.unitsWithBalanceDue.map((balance) => ({
      icon: TriangleAlert,
      label: own ? "Nachzahlung offen" : `Nachzahlung ${balance.unitName}`,
      value: formatCents(Math.abs(balance.balanceCents)),
      href: unitStatementHref(balance.unitId) ?? `/abrechnung/${year}`,
    })),
    ...(openItems.pendingPayments.count > 0
      ? [
          {
            icon: Clock,
            label: `${openItems.pendingPayments.count} erwartete ${openItems.pendingPayments.count === 1 ? "Einzahlung" : "Einzahlungen"} noch offen`,
            value: formatCents(openItems.pendingPayments.cents),
            href: `/einzahlungen?jahr=${year}&status=offen`,
          },
        ]
      : []),
    ...(openItems.undistributedCents !== 0
      ? [
          {
            icon: PieChart,
            label: "Kosten ohne Schlüsselwerte – nicht verteilt",
            value: formatCents(openItems.undistributedCents),
            href: `/abrechnung/${year}/schluessel`,
          },
        ]
      : []),
    ...(openItems.costsWithoutDocument > 0
      ? [
          {
            icon: ReceiptText,
            label: `${openItems.costsWithoutDocument === 1 ? "Kostenposition" : "Kostenpositionen"} ohne Beleg`,
            value: String(openItems.costsWithoutDocument),
            // Gezählt sind freigegebene Positionen – dieselbe Auswahl zeigt die Liste.
            href: withParams(costsPath, { beleg: "ohne", pruefung: "freigegeben" }),
          },
        ]
      : []),
    ...(openItems.unassignedDocuments > 0
      ? [
          {
            icon: FileQuestion,
            label: `${openItems.unassignedDocuments === 1 ? "Dokument" : "Dokumente"} ohne Zuordnung`,
            value: String(openItems.unassignedDocuments),
            href: withParams("/dokumente", { jahr: year, zuordnung: "ohne", pruefung: "freigegeben" }),
          },
        ]
      : []),
  ];

  const activityHref = (activity: Activity) =>
    activity.kind === "cost" || activity.kind === "credit"
      ? own
        ? `/abrechnung/${year}?position=${activity.id}`
        : `/abrechnung/${year}/kosten?position=${activity.id}`
      : activity.kind === "payment"
        ? withParams("/einzahlungen", { jahr: year, zahlung: activity.id })
        : withParams("/dokumente", { jahr: year, q: activity.title });

  /** Kosten eines Zeitabschnitts im Kostenverlauf: ein Monat bzw. ein ganzes Abrechnungsjahr. */
  const trendHref = (point: { year: number; month: number | null }) => {
    if (!trendPeriod) return `/abrechnung/${point.year}`;
    if (point.month === null) return undefined;
    if (own) return `/abrechnung/${point.year}/monate`;
    const { from, to } = monthRange(point.year, point.month);
    return withParams(`/abrechnung/${point.year}/kosten`, { von: from, bis: to });
  };

  const cell = "px-2 py-2.5 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={own && user.unitName ? `Übersicht ${user.unitName}` : "Übersicht Gesamtgebäude"}
      >
        <YearSelect
          years={periods.map((p) => p.year)}
          value={year}
          hrefPattern="/dashboard?jahr={year}"
        />
        <AddButton user={user} area="dashboard" period={period} />
      </PageHeader>

      {/* Aktuelle Abrechnungsperiode */}
      <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <CalendarRange className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted">Abrechnungsperiode</p>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              Abrechnungsjahr {year}
              <PeriodStatusBadge status={period.status} />
            </p>
            <p className="text-sm text-muted">
              {formatDate(period.startDate)} – {formatDate(period.endDate)} ·{" "}
              <MaybeLink href={costsHref({ art: "kosten" })}>
                {data.costCount} {data.costCount === 1 ? "Kostenposition" : "Kostenpositionen"}
              </MaybeLink>
              {data.creditCount > 0 ? (
                <>
                  {" · "}
                  <MaybeLink href={costsHref({ art: "gutschriften" })}>
                    {creditCountLabel(data.creditCount)}
                  </MaybeLink>
                </>
              ) : null}
              {" · "}
              <MaybeLink href={documentsHref()}>
                {data.documentCount} {data.documentCount === 1 ? "Dokument" : "Dokumente"}
              </MaybeLink>
            </p>
          </div>
        </div>
        <ButtonLink href={`/abrechnung/${year}`} variant="secondary">
          Zur Abrechnung
          <ChevronRight aria-hidden />
        </ButtonLink>
      </Card>

      {/* Oben die Kostenseite – Kosten, Gutschriften, Nettokosten –, darunter Zahlungen und Belege. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label={own ? "Kosten (mein Anteil)" : "Kosten"}
          value={formatCents(data.costBeforeCreditsCents)}
          icon={ReceiptText}
          href={costsHref({ art: "kosten" })}
          hrefLabel={own ? "Abrechnung anzeigen" : "Kostenpositionen anzeigen"}
        >
          {data.costCount} {data.costCount === 1 ? "Kostenposition" : "Kostenpositionen"}
        </StatTile>
        <StatTile
          label={own ? "Gutschriften (mein Anteil)" : "Gutschriften"}
          value={formatCredit(data.creditCents)}
          icon={FileMinus}
          href={costsHref({ art: "gutschriften" })}
          hrefLabel={own ? "Abrechnung anzeigen" : "Gutschriften anzeigen"}
        >
          {data.creditCount === 0
            ? "Keine Gutschriften"
            : `${creditCountLabel(data.creditCount)} – ${data.creditCount === 1 ? "mindert" : "mindern"} die Kosten`}
        </StatTile>
        <StatTile
          label={own ? "Mein Kostenanteil" : "Nettokosten"}
          value={formatCents(data.costCents)}
          icon={Sigma}
          href={statementHref}
          hrefLabel="Abrechnung anzeigen"
        >
          Kosten abzüglich Gutschriften
        </StatTile>
        <StatTile
          label={own ? "Meine Einzahlungen" : "Einzahlungen gesamt"}
          value={formatCents(data.paymentCents)}
          icon={Wallet}
          href={paymentsHref()}
          hrefLabel="Einzahlungen anzeigen"
        >
          {data.costCents > 0
            ? `decken ${formatPercent(Math.max(data.paymentCents, 0) / data.costCents)} der ${own ? "Kosten" : "Nettokosten"}`
            : "eingegangen"}
        </StatTile>
        <StatTile
          label={balanceLabel(data.balanceCents)}
          value={formatCents(Math.abs(data.balanceCents))}
          icon={Scale}
          href={statementHref}
          hrefLabel="Abrechnung je TOP anzeigen"
        >
          <BalanceBadge cents={data.balanceCents} />
        </StatTile>
        <StatTile
          label="Belege & Dokumente"
          value={String(data.documentCount)}
          icon={Files}
          href={documentsHref()}
          hrefLabel="Dokumente anzeigen"
        >
          {own
            ? `im Abrechnungsjahr ${year}`
            : openItems.costsWithoutDocument === 0
              ? "Alle Kosten sind belegt"
              : `${openItems.costsWithoutDocument} ${openItems.costsWithoutDocument === 1 ? "Position" : "Positionen"} ohne Beleg`}
        </StatTile>
      </div>

      {trend ? (
        <Card>
          <CardHeader
            title="Kostenverlauf"
            description={
              (trendPeriod
                ? `Kosten je Monat im Abrechnungsjahr ${trendPeriod.year} (nach Rechnungsdatum)`
                : "Kosten je Abrechnungsjahr") +
              (own ? " – dein Anteil." : " – gestapelt nach TOP.") +
              (trend.creditCents > 0
                ? ` Kosten ${formatCents(trend.costCents)}, Gutschriften ${formatCredit(trend.creditCents)}, Nettokosten ${formatCents(trend.totalCents)}.`
                : ` Summe ${formatCents(trend.totalCents)}.`)
            }
            action={
              <div className="flex flex-wrap items-center gap-2">
                {trendPeriod && can(user, "payment:read") ? (
                  <ButtonLink href={`/abrechnung/${trendPeriod.year}/monate`} variant="ghost" size="sm">
                    Monatsübersicht
                  </ButtonLink>
                ) : null}
                <NavSelect
                  label="Zeitraum des Kostenverlaufs"
                  value={trendPeriod ? String(trendPeriod.year) : TREND_ALL}
                  options={[
                    ...periods.map((p) => ({ value: String(p.year), label: `Monate ${p.year}` })),
                    { value: TREND_ALL, label: "Alle Jahre" },
                  ]}
                  hrefPattern={`/dashboard?jahr=${year}&verlauf={value}`}
                />
              </div>
            }
          />
          <CardContent>
            {trend.costCents === 0 && trend.creditCents === 0 ? (
              <p className="text-sm text-muted">Für diesen Zeitraum sind noch keine Kosten erfasst.</p>
            ) : (
              <CostTrendChart
                trend={trend}
                singleLabel={own ? "Mein Kostenanteil" : "Kosten gesamt"}
                pointHref={trendHref}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Laufendes Konto über alle Jahre – unabhängig vom oben gewählten Abrechnungsjahr. */}
      {account?.startDate && account.units.length > 0 ? (
        <Card>
          <CardHeader
            title="Abrechnungskonto"
            description={`Seit ${formatDate(account.startDate)}: Anfangssaldo + Einzahlungen − Auszahlungen = aktueller Saldo.`}
            action={
              <ButtonLink href="/einzahlungen/konto" variant="ghost" size="sm">
                Zum Konto
              </ButtonLink>
            }
          />
          <AccountSummaryTable account={account} unitHref={(unit) => accountHref(unit.unitId)} />
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold">Aktuelle Bewegungen</h3>
            {recentMovements.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                Seit dem Stichtag gibt es noch keine Ein- oder Auszahlungen.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-border text-sm">
                {recentMovements.map((movement) => (
                  <li key={movement.id}>
                    {/* Führt zum Kontoauszug der TOP, in dem die Bewegung steht. */}
                    <Link href={accountHref(movement.unitId)} className={cn(rowLinkClass, "flex-wrap gap-x-4 gap-y-0.5 py-2")}>
                      <span className="w-20 shrink-0 tabular-nums">{formatDate(movement.date)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {own ? "" : `${movement.unitName} · `}
                        {movement.purpose ?? (movement.amountCents < 0 ? "Auszahlung" : "Einzahlung")}
                      </span>
                      <span className="ml-auto font-medium tabular-nums">
                        {formatCents(movement.amountCents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : account && can(user, "account:manage") ? (
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:px-5">
          <div className="min-w-0">
            <p className="font-semibold">Abrechnungskonto</p>
            <p className="text-sm text-muted">
              Die laufende Kontoführung ist noch nicht eingerichtet – lege Stichtag und Anfangssalden
              je TOP fest.
            </p>
          </div>
          <ButtonLink href="/einzahlungen/konto" variant="secondary">
            Konto einrichten
            <ChevronRight aria-hidden />
          </ButtonLink>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={own ? "Meine Abrechnung" : "Abrechnung je TOP"}
            description="Einzahlungen minus Nettokosten (Kosten abzüglich Gutschriften) = Guthaben bzw. Nachzahlung."
            action={
              <ButtonLink href={`/abrechnung/${year}`} variant="ghost" size="sm">
                Details
              </ButtonLink>
            }
          />
          {data.balances.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Deinem Konto ist keine TOP zugeordnet.</p>
            </CardContent>
          ) : (
            <div className="px-2 pt-2 pb-2 sm:px-3">
              <table className="w-full text-sm">
                <caption className="sr-only">Nettokosten, Einzahlungen und Differenz je TOP</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      TOP
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Nettokosten
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Einzahlungen
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Differenz
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.balances.map((balance) => (
                    <tr key={balance.unitId} className="hover:bg-surface-muted/50">
                      <th scope="row" className="px-2 py-2.5 text-left font-medium whitespace-nowrap">
                        <MaybeLink
                          href={unitStatementHref(balance.unitId)}
                          title={`Abrechnung ${balance.unitName} anzeigen`}
                        >
                          {balance.unitName}
                        </MaybeLink>
                      </th>
                      <td className={cell}>
                        <MaybeLink
                          href={own ? undefined : costsHref({ top: unitNumber.get(balance.unitId) })}
                          title={`Kostenpositionen ${balance.unitName} anzeigen`}
                        >
                          {formatCents(balance.costCents)}
                        </MaybeLink>
                      </td>
                      <td className={cell}>
                        <MaybeLink
                          href={paymentsHref(own ? {} : { top: unitNumber.get(balance.unitId) })}
                          title={`Einzahlungen ${balance.unitName} anzeigen`}
                        >
                          {formatCents(balance.paymentCents)}
                        </MaybeLink>
                      </td>
                      <td className={cell}>
                        <span className="font-semibold">
                          {formatCents(Math.abs(balance.balanceCents))}
                        </span>
                        <span className="mt-1 flex justify-end">
                          <BalanceBadge cents={balance.balanceCents} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.balances.length > 1 ? (
                  <tfoot className="border-t-2 border-border-strong font-semibold">
                    <tr>
                      <th scope="row" className="px-2 py-2.5 text-left">
                        Gesamt
                      </th>
                      <td className={cell}>
                        <MaybeLink href={statementHref}>{formatCents(data.costCents)}</MaybeLink>
                      </td>
                      <td className={cell}>
                        <MaybeLink href={paymentsHref()}>{formatCents(data.paymentCents)}</MaybeLink>
                      </td>
                      <td className={cell}>{formatCents(Math.abs(data.balanceCents))}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Kosten nach Kostenart"
            description={
              (own ? "Dein Anteil je Kostenart." : "Summe je Kostenart über alle TOPs.") +
              (data.creditCount > 0 ? " Gutschriften stehen getrennt darunter." : "")
            }
            action={
              costsHref() ? (
                <ButtonLink href={costsHref()!} variant="ghost" size="sm">
                  {own ? "Zur Abrechnung" : "Alle Kosten"}
                </ButtonLink>
              ) : null
            }
          />
          <CardContent>
            {data.categories.length === 0 ? (
              <p className="text-sm text-muted">Für {year} sind noch keine Kosten erfasst.</p>
            ) : (
              <CategoryBars
                categories={data.categories}
                href={(category) => costsHref({ kostenart: category.categoryId, art: "kosten" })}
                creditHref={(category) =>
                  costsHref({ kostenart: category.categoryId, art: "gutschriften" })
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Offene Positionen"
            description={`Was im Abrechnungsjahr ${year} noch zu erledigen ist.`}
          />
          <CardContent className="pt-2">
            {openRows.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-muted">
                <CircleCheck className="size-4 text-success" aria-hidden />
                Keine offenen Positionen.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {openRows.map((row) => (
                  <li key={row.label}>
                    <Link href={row.href} className={rowLinkClass}>
                      <row.icon className="size-4 shrink-0 text-warning" aria-hidden />
                      <span className="min-w-0 flex-1">{row.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{row.value}</span>
                      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Letzte Dokumente"
            action={
              <ButtonLink href={`/dokumente?jahr=${year}`} variant="ghost" size="sm">
                Alle anzeigen
              </ButtonLink>
            }
          />
          <CardContent className="pt-2">
            {data.recentDocuments.length === 0 ? (
              <p className="py-2 text-sm text-muted">Noch keine Dokumente.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentDocuments.map((document) => (
                  <li key={document.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <DocumentPreviewButton document={document} variant="link" />
                      <p className="truncate text-xs text-muted">
                        {/* Die Zuordnung führt zur Kostenposition bzw. Einzahlung. */}
                        <MaybeLink
                          href={
                            document.costs[0]
                              ? own
                                ? `/abrechnung/${document.year}?position=${document.costs[0].id}`
                                : `/abrechnung/${document.year}/kosten?position=${document.costs[0].id}`
                              : document.payments[0]
                                ? withParams("/einzahlungen", {
                                    jahr: document.year,
                                    zahlung: document.payments[0].id,
                                  })
                                : undefined
                          }
                        >
                          {document.costs[0]?.label ??
                            document.payments[0]?.label ??
                            document.description ??
                            "Noch nicht zugeordnet"}
                        </MaybeLink>{" "}
                        · {formatDate(document.createdAt)}
                      </p>
                    </div>
                    <Link
                      href={withParams("/dokumente", { jahr: year, typ: document.type })}
                      title={`Alle Dokumente vom Typ ${DOCUMENT_TYPE_LABELS[document.type]} anzeigen`}
                      className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Badge tone="primary">{DOCUMENT_TYPE_LABELS[document.type]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Letzte Aktivitäten" description="Zuletzt erfasste Kosten, Einzahlungen und Dokumente." />
        <CardContent className="pt-2">
          {data.activities.length === 0 ? (
            <p className="py-2 text-sm text-muted">Noch keine Aktivitäten im Abrechnungsjahr {year}.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.activities.map((activity) => {
                const Icon = ACTIVITY_ICON[activity.kind];
                return (
                  <li key={`${activity.kind}-${activity.id}`}>
                    <Link href={activityHref(activity)} className={rowLinkClass}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{activity.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {[ACTIVITY_LABEL[activity.kind], activity.detail, formatDateTime(activity.at)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {activity.amountCents !== null ? (
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatCents(activity.amountCents)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
