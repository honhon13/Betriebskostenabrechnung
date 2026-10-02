import {
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  CircleCheck,
  Clock,
  FileQuestion,
  FileText,
  Files,
  PieChart,
  ReceiptText,
  Scale,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { BalanceBadge, balanceLabel } from "@/components/billing/balance-badge";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { CategoryBars } from "@/components/dashboard/category-bars";
import { StatTile } from "@/components/dashboard/stat-tile";
import { DocumentPreviewButton } from "@/components/documents/document-preview";
import { YearSelect } from "@/components/layout/year-select";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents, formatDate, formatDateTime, formatPercent } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { getDashboard, type Activity } from "@/services/dashboard.service";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";

export const metadata: Metadata = { title: "Dashboard" };

const ACTIVITY_ICON: Record<Activity["kind"], LucideIcon> = {
  cost: ReceiptText,
  payment: Wallet,
  document: FileText,
};

const ACTIVITY_LABEL: Record<Activity["kind"], string> = {
  cost: "Kosten erfasst",
  payment: "Einzahlung erfasst",
  document: "Dokument hochgeladen",
};

interface OpenRow {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  if (!can(user, "dashboard:view") || !can(user, "period:read")) return <NoAccess />;

  const { jahr } = await searchParams;
  const periods = await listPeriods(user);
  const period = periods.find((p) => p.year === Number(jahr)) ?? pickDefaultPeriod(periods);
  const scope = getDataScope(user);

  if (!period) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <Card>
          <EmptyState
            icon={CalendarPlus}
            title={scope.includeDrafts ? "Noch kein Abrechnungsjahr" : "Noch keine freigegebene Abrechnung"}
            description={
              scope.includeDrafts
                ? "Lege das erste Abrechnungsjahr an, um Kosten und Einzahlungen zu erfassen."
                : "Sobald die Verwaltung eine Abrechnung freigibt, erscheint sie hier."
            }
          >
            {can(user, "period:write") ? (
              <ButtonLink href="/abrechnung">Zur Abrechnung</ButtonLink>
            ) : null}
          </EmptyState>
        </Card>
      </div>
    );
  }

  const data = await getDashboard(user, period.id);
  const own = !scope.allUnits;
  const year = period.year;
  const { openItems } = data;

  // Offene Positionen: nur Zeilen, bei denen wirklich etwas zu tun ist.
  const openRows: OpenRow[] = [
    ...openItems.unitsWithBalanceDue.map((balance) => ({
      icon: TriangleAlert,
      label: own ? "Nachzahlung offen" : `Nachzahlung ${balance.unitName}`,
      value: formatCents(Math.abs(balance.balanceCents)),
      href: `/abrechnung/${year}`,
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
            href: `/abrechnung/${year}/kosten`,
          },
        ]
      : []),
    ...(openItems.unassignedDocuments > 0
      ? [
          {
            icon: FileQuestion,
            label: `${openItems.unassignedDocuments === 1 ? "Dokument" : "Dokumente"} ohne Zuordnung`,
            value: String(openItems.unassignedDocuments),
            href: `/dokumente?jahr=${year}`,
          },
        ]
      : []),
  ];

  const activityHref = (activity: Activity) =>
    activity.kind === "cost"
      ? own
        ? `/abrechnung/${year}?position=${activity.id}`
        : `/abrechnung/${year}/kosten?position=${activity.id}`
      : activity.kind === "payment"
        ? `/einzahlungen?jahr=${year}`
        : `/dokumente?jahr=${year}`;

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
              {formatDate(period.startDate)} – {formatDate(period.endDate)} · {data.costCount}{" "}
              {data.costCount === 1 ? "Kostenposition" : "Kostenpositionen"} · {data.documentCount}{" "}
              {data.documentCount === 1 ? "Dokument" : "Dokumente"}
            </p>
          </div>
        </div>
        <ButtonLink href={`/abrechnung/${year}`} variant="secondary">
          Zur Abrechnung
          <ChevronRight aria-hidden />
        </ButtonLink>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={own ? "Mein Kostenanteil" : "Gesamtkosten"}
          value={formatCents(data.costCents)}
          icon={ReceiptText}
        >
          {data.costCount} {data.costCount === 1 ? "Position" : "Positionen"}
        </StatTile>
        <StatTile
          label={own ? "Meine Einzahlungen" : "Einzahlungen gesamt"}
          value={formatCents(data.paymentCents)}
          icon={Wallet}
        >
          {data.costCents > 0
            ? `decken ${formatPercent(Math.max(data.paymentCents, 0) / data.costCents)} der Kosten`
            : "eingegangen"}
        </StatTile>
        <StatTile
          label={balanceLabel(data.balanceCents)}
          value={formatCents(Math.abs(data.balanceCents))}
          icon={Scale}
        >
          <BalanceBadge cents={data.balanceCents} />
        </StatTile>
        <StatTile label="Belege & Dokumente" value={String(data.documentCount)} icon={Files}>
          {own
            ? `im Abrechnungsjahr ${year}`
            : openItems.costsWithoutDocument === 0
              ? "Alle Kosten sind belegt"
              : `${openItems.costsWithoutDocument} ${openItems.costsWithoutDocument === 1 ? "Position" : "Positionen"} ohne Beleg`}
        </StatTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={own ? "Meine Abrechnung" : "Abrechnung je TOP"}
            description="Einzahlungen minus Kostenanteil = Guthaben bzw. Nachzahlung."
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
                <caption className="sr-only">Kosten, Einzahlungen und Differenz je TOP</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      TOP
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Kosten
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
                    <tr key={balance.unitId}>
                      <th scope="row" className="px-2 py-2.5 text-left font-medium whitespace-nowrap">
                        {balance.unitName}
                      </th>
                      <td className={cell}>{formatCents(balance.costCents)}</td>
                      <td className={cell}>{formatCents(balance.paymentCents)}</td>
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
                      <td className={cell}>{formatCents(data.costCents)}</td>
                      <td className={cell}>{formatCents(data.paymentCents)}</td>
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
            description={own ? "Dein Anteil je Kostenart." : "Summe je Kostenart über alle TOPs."}
          />
          <CardContent>
            {data.categories.length === 0 ? (
              <p className="text-sm text-muted">Für {year} sind noch keine Kosten erfasst.</p>
            ) : (
              <CategoryBars categories={data.categories} />
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
                    <Link
                      href={row.href}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
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
                        {document.costs[0]?.label ??
                          document.payments[0]?.label ??
                          document.description ??
                          "Noch nicht zugeordnet"}{" "}
                        · {formatDate(document.createdAt)}
                      </p>
                    </div>
                    <Badge tone="primary">{DOCUMENT_TYPE_LABELS[document.type]}</Badge>
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
                    <Link
                      href={activityHref(activity)}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
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
