import { CalendarPlus, FileText, Paperclip, ReceiptText, Scale, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { BalanceBadge, balanceLabel } from "@/components/billing/balance-badge";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { CategoryBars } from "@/components/dashboard/category-bars";
import { CoverageMeter } from "@/components/dashboard/coverage-meter";
import { StatTile } from "@/components/dashboard/stat-tile";
import { YearSelect } from "@/components/layout/year-select";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents, formatDate, formatFileSize } from "@/lib/format";
import { getDashboard } from "@/services/dashboard.service";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";

export const metadata: Metadata = { title: "Dashboard" };

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Abrechnungsjahr {period.year}
            <PeriodStatusBadge status={period.status} />
            {own && user.unitName ? <span>· {user.unitName}</span> : null}
          </span>
        }
      >
        <YearSelect
          years={periods.map((p) => p.year)}
          value={period.year}
          hrefPattern="/dashboard?jahr={year}"
        />
      </PageHeader>

      {data.undistributedCents !== 0 ? (
        <Alert tone="warning" title="Nicht alle Kosten sind verteilt">
          {formatCents(data.undistributedCents)} konnten keiner TOP zugeordnet werden, weil
          Schlüsselwerte fehlen.{" "}
          <Link href={`/abrechnung/${period.year}/schluessel`} className="font-medium underline">
            Umlageschlüssel prüfen
          </Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={own ? "Mein Kostenanteil" : "Kosten gesamt"}
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
          im Abrechnungsjahr {period.year}
        </StatTile>
        <StatTile
          label={balanceLabel(data.balanceCents)}
          value={formatCents(Math.abs(data.balanceCents))}
          icon={Scale}
        >
          <BalanceBadge cents={data.balanceCents} />
        </StatTile>
        <StatTile label="Belege" value={String(data.receiptCount)} icon={Paperclip}>
          {data.costsWithoutReceipt === 0
            ? "Alle Kosten sind belegt"
            : `${data.costsWithoutReceipt} ${data.costsWithoutReceipt === 1 ? "Position" : "Positionen"} ohne Beleg`}
        </StatTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={own ? "Meine Abrechnung" : "Saldo je TOP"}
            description="Kostenanteil, Einzahlungen und offener Betrag bzw. Guthaben."
            action={
              <ButtonLink href={`/abrechnung/${period.year}`} variant="ghost" size="sm">
                Details
              </ButtonLink>
            }
          />
          <CardContent className="space-y-5">
            {data.balances.length === 0 ? (
              <p className="text-sm text-muted">Deinem Konto ist keine TOP zugeordnet.</p>
            ) : (
              data.balances.map((balance) => (
                <div key={balance.unitId} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{balance.unitName}</p>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">
                        {formatCents(Math.abs(balance.balanceCents))}
                      </span>
                      <BalanceBadge cents={balance.balanceCents} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Kosten</dt>
                      <dd className="tabular-nums">{formatCents(balance.costCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Einzahlungen</dt>
                      <dd className="tabular-nums">{formatCents(balance.paymentCents)}</dd>
                    </div>
                  </dl>
                  <CoverageMeter paymentCents={balance.paymentCents} costCents={balance.costCents} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Kosten nach Kostenart"
            description={own ? "Dein Anteil je Kostenart." : "Summe je Kostenart über alle TOPs."}
          />
          <CardContent>
            {data.categories.length === 0 ? (
              <p className="text-sm text-muted">Für {period.year} sind noch keine Kosten erfasst.</p>
            ) : (
              <CategoryBars categories={data.categories} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Letzte Einzahlungen"
            action={
              <ButtonLink href={`/einzahlungen?jahr=${period.year}`} variant="ghost" size="sm">
                Alle anzeigen
              </ButtonLink>
            }
          />
          <CardContent className="pt-2">
            {data.recentPayments.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Einzahlungen.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentPayments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {own ? (payment.purpose ?? "Einzahlung") : payment.unitName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDate(payment.paymentDate)}
                        {!own && payment.purpose ? ` · ${payment.purpose}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatCents(payment.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Letzte Belege"
            action={
              <ButtonLink href={`/abrechnung/${period.year}/belege`} variant="ghost" size="sm">
                Alle anzeigen
              </ButtonLink>
            }
          />
          <CardContent className="pt-2">
            {data.recentReceipts.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Belege.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentReceipts.map((receipt) => (
                  <li key={receipt.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/belege/${receipt.id}/datei`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {receipt.fileName}
                      </a>
                      <p className="truncate text-xs text-muted">
                        {receipt.costLabel ?? "Noch keiner Kostenposition zugeordnet"} ·{" "}
                        {formatFileSize(receipt.sizeBytes)}
                      </p>
                    </div>
                    {receipt.amountCents !== null ? (
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCents(receipt.amountCents)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
