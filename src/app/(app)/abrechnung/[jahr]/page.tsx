import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { can, getDataScope } from "@/auth/rbac";
import { BalanceBadge, balanceLabel } from "@/components/billing/balance-badge";
import { StatementMatrix } from "@/components/billing/statement-matrix";
import { CoverageMeter } from "@/components/dashboard/coverage-meter";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState } from "@/components/ui/page";
import { formatCents, formatDate, formatNumber } from "@/lib/format";
import { loadPeriodPage } from "@/services/page-context";
import { getStatement } from "@/services/statement.service";
import type { StatementLine } from "@/types/billing";

export async function generateMetadata({
  params,
}: PageProps<"/abrechnung/[jahr]">): Promise<Metadata> {
  return { title: `Abrechnung ${(await params).jahr}` };
}

export default async function StatementPage({ params }: PageProps<"/abrechnung/[jahr]">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "cost:read")) return <NoAccess />;

  const statement = await getStatement(user, period.id);
  const scope = getDataScope(user);
  const draft = period.status === "draft";

  if (statement.lines.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ReceiptText}
          title="Noch keine Kosten erfasst"
          description={`Für ${period.year} gibt es noch keine Kostenpositionen.`}
        >
          {scope.allUnits && can(user, "cost:write") && draft ? (
            <ButtonLink href={`/abrechnung/${period.year}/kosten`}>Kosten erfassen</ButtonLink>
          ) : null}
        </EmptyState>
      </Card>
    );
  }

  const warning =
    statement.undistributedCents !== 0 ? (
      <Alert tone="warning" title="Nicht alle Kosten sind verteilt">
        {formatCents(statement.undistributedCents)} konnten keiner TOP zugeordnet werden, weil die
        Summe der Schlüsselwerte 0 ist.
        {scope.allUnits ? (
          <>
            {" "}
            <Link href={`/abrechnung/${period.year}/schluessel`} className="font-medium underline">
              Umlageschlüssel prüfen
            </Link>
          </>
        ) : null}
      </Alert>
    ) : null;

  if (scope.allUnits) {
    return (
      <div className="space-y-4">
        {warning}
        <Card>
          <CardHeader
            title="Kostenverteilung"
            description={
              draft
                ? "Entwurf – für TOP 1 und TOP 3 erst nach der Freigabe sichtbar."
                : "Freigegeben – so sehen die TOPs ihre Anteile."
            }
          />
          <div className="pt-3 pb-1">
            <StatementMatrix statement={statement} />
          </div>
        </Card>
      </div>
    );
  }

  // Sicht einer einzelnen TOP: nur eigene Positionen und der eigene Anteil.
  const balance = statement.balances[0];
  const ownShare = (line: StatementLine) => line.shares[0];

  const columns: Column<StatementLine>[] = [
    {
      key: "position",
      header: "Position",
      mobile: false,
      cell: (line) => (
        <>
          <span className="font-medium">{line.description}</span>
          <span className="block text-xs text-muted">{line.categoryName}</span>
        </>
      ),
    },
    { key: "date", header: "Datum", cell: (line) => formatDate(line.costDate) },
    {
      key: "amount",
      header: "Gesamtbetrag",
      align: "right",
      cell: (line) => formatCents(line.amountCents),
    },
    {
      key: "key",
      header: "Umlageschlüssel",
      cell: (line) => (
        <>
          {line.keyName}
          {line.distributable && line.keyUnitLabel ? (
            <span className="block text-xs text-muted">
              {formatNumber(ownShare(line).weight)} von {formatNumber(line.totalWeight)}{" "}
              {line.keyUnitLabel}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "share",
      header: "Mein Anteil",
      align: "right",
      mobile: false,
      cell: (line) => <span className="font-medium">{formatCents(ownShare(line).cents)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {warning}
      {balance ? (
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted">Mein Kostenanteil</p>
              <p className="mt-1 text-xl font-semibold">{formatCents(balance.costCents)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Meine Einzahlungen</p>
              <p className="mt-1 text-xl font-semibold">{formatCents(balance.paymentCents)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{balanceLabel(balance.balanceCents)}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
                {formatCents(Math.abs(balance.balanceCents))}
                <BalanceBadge cents={balance.balanceCents} />
              </p>
            </div>
            <div className="sm:col-span-3">
              <CoverageMeter paymentCents={balance.paymentCents} costCents={balance.costCents} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`Kostenpositionen ${user.unitName ?? ""}`.trim()}
          description="Alle Kosten, an denen deine TOP beteiligt ist, mit deinem Anteil."
        />
        <div className="pt-3">
          <DataTable
            caption="Kostenpositionen mit eigenem Anteil"
            rows={statement.lines}
            columns={columns}
            rowKey={(line) => line.costId}
            mobileTitle={(line) => (
              <>
                {line.description}
                <span className="block text-xs font-normal text-muted">{line.categoryName}</span>
              </>
            )}
            mobileValue={(line) => formatCents(ownShare(line).cents)}
            footer={
              <tr className="font-semibold">
                <td colSpan={4} className="px-3 py-2.5 pl-5">
                  Summe
                </td>
                <td className="px-3 py-2.5 pr-5 text-right tabular-nums">
                  {formatCents(balance?.costCents ?? 0)}
                </td>
              </tr>
            }
          />
        </div>
      </Card>
    </div>
  );
}
