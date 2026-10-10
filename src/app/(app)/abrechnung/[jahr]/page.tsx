import { FileMinus, ReceiptText, Scale, Sigma, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { can, getDataScope } from "@/auth/rbac";
import { BalanceBadge } from "@/components/billing/balance-badge";
import { StatementMatrix } from "@/components/billing/statement-matrix";
import { UnitStatement } from "@/components/billing/unit-statement";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState } from "@/components/ui/page";
import { summarizeStatement } from "@/lib/billing/allocation";
import { readParam, withParams } from "@/lib/filters";
import { creditCountLabel, formatCents, formatCredit } from "@/lib/format";
import { listUnits } from "@/services/masterdata.service";
import { loadPeriodPage } from "@/services/page-context";
import { listPayments } from "@/services/payments.service";
import { getStatement } from "@/services/statement.service";

export async function generateMetadata({
  params,
}: PageProps<"/abrechnung/[jahr]">): Promise<Metadata> {
  return { title: `Abrechnung ${(await params).jahr}` };
}

/**
 * Abrechnungsübersicht eines Jahres: Gesamtsummen – Kosten, Gutschriften und Nettokosten
 * getrennt –, Kostenverteilung und je TOP Kostenanteil, Einzahlungen, Differenz samt
 * Kostenpositionen und Belegen.
 */
export default async function StatementPage({
  params,
  searchParams,
}: PageProps<"/abrechnung/[jahr]">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "cost:read")) return <NoAccess />;

  const scope = getDataScope(user);
  const [statement, payments, units] = await Promise.all([
    getStatement(user, period.id),
    can(user, "payment:read") ? listPayments(user, { periodId: period.id }) : [],
    listUnits(user),
  ]);
  const totals = summarizeStatement(statement, scope.allUnits);
  const draft = period.status === "draft";
  const query = await searchParams;
  const highlighted = Number(query.position);
  // ?top=2 klappt die Abrechnung dieser TOP auf (Sprungziel #top-2) – z. B. vom Dashboard aus.
  const unitNumber = new Map(units.map((unit) => [unit.id, unit.number]));
  const openUnit = scope.allUnits
    ? units.find((unit) => String(unit.number) === readParam(query, "top"))
    : undefined;
  const kostenPath = `/abrechnung/${period.year}/kosten`;
  const canSeePayments = can(user, "payment:read");
  const costCount = statement.lines.length - statement.creditCount;

  if (statement.lines.length === 0 && payments.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ReceiptText}
          title="Noch keine Kosten erfasst"
          description={`Für ${period.year} gibt es noch keine Kostenpositionen und Einzahlungen.`}
        >
          {scope.allUnits && can(user, "cost:write") && draft ? (
            <ButtonLink href={`/abrechnung/${period.year}/kosten`}>Kosten erfassen</ButtonLink>
          ) : null}
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {statement.undistributedCents !== 0 ? (
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
      ) : null}

      {/* Obere Reihe: die Kostenseite. Gutschriften sind eine eigene Position, keine Kosten. */}
      <section aria-label="Gesamt" className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatTile
          className="sm:col-span-2"
          label={scope.allUnits ? "Kosten" : "Kosten (mein Anteil)"}
          value={formatCents(totals.costBeforeCreditsCents)}
          icon={ReceiptText}
          href={scope.allUnits ? withParams(kostenPath, { art: "kosten" }) : undefined}
          hrefLabel="Kostenpositionen anzeigen"
        >
          {costCount} {costCount === 1 ? "Kostenposition" : "Kostenpositionen"}
        </StatTile>
        <StatTile
          className="sm:col-span-2"
          label={scope.allUnits ? "Gutschriften" : "Gutschriften (mein Anteil)"}
          value={formatCredit(totals.creditCents)}
          icon={FileMinus}
          href={scope.allUnits ? withParams(kostenPath, { art: "gutschriften" }) : undefined}
          hrefLabel="Gutschriften anzeigen"
        >
          {totals.creditCount === 0 ? "Keine Gutschriften" : creditCountLabel(totals.creditCount)}
        </StatTile>
        <StatTile
          className="sm:col-span-2"
          label={scope.allUnits ? "Nettokosten" : "Mein Kostenanteil"}
          value={formatCents(totals.costCents)}
          icon={Sigma}
        >
          Kosten abzüglich Gutschriften
        </StatTile>
        <StatTile
          className="sm:col-span-3"
          label={scope.allUnits ? "Gesamtzahlungen" : "Meine Einzahlungen"}
          value={formatCents(totals.paymentCents)}
          icon={Wallet}
          href={canSeePayments ? withParams("/einzahlungen", { jahr: period.year }) : undefined}
          hrefLabel="Einzahlungen anzeigen"
        >
          {totals.pendingPaymentCents !== 0
            ? `zusätzlich ${formatCents(totals.pendingPaymentCents)} offen erwartet`
            : "eingegangene Zahlungen"}
        </StatTile>
        <StatTile
          className="col-span-2 sm:col-span-3"
          label="Differenz"
          value={formatCents(Math.abs(totals.balanceCents))}
          icon={Scale}
        >
          <BalanceBadge cents={totals.balanceCents} />
        </StatTile>
      </section>

      {scope.allUnits && statement.lines.length > 0 ? (
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
      ) : null}

      <section className="space-y-3">
        {scope.allUnits ? <h2 className="pt-2 text-base font-semibold">Abrechnung je TOP</h2> : null}
        {statement.balances.length === 0 ? (
          <Card>
            <p className="p-5 text-sm text-muted">Deinem Konto ist keine TOP zugeordnet.</p>
          </Card>
        ) : (
          statement.balances.map((balance) => (
            <UnitStatement
              key={balance.unitId}
              id={`top-${unitNumber.get(balance.unitId)}`}
              year={period.year}
              balance={balance}
              lines={statement.lines.filter((line) =>
                line.shares.some((share) => share.unitId === balance.unitId),
              )}
              payments={payments.filter((payment) => payment.unitId === balance.unitId)}
              documentsHref={
                scope.allUnits
                  ? withParams("/dokumente", { jahr: period.year, top: unitNumber.get(balance.unitId) })
                  : undefined
              }
              paymentsHref={
                canSeePayments
                  ? withParams("/einzahlungen", {
                      jahr: period.year,
                      top: scope.allUnits ? unitNumber.get(balance.unitId) : undefined,
                    })
                  : undefined
              }
              costsHref={
                scope.allUnits
                  ? withParams(kostenPath, { top: unitNumber.get(balance.unitId) })
                  : undefined
              }
              // Die eigene Abrechnung ist direkt aufgeklappt; die Verwaltung klappt je TOP auf –
              // oder kommt über einen Link direkt bei einer TOP an.
              defaultOpen={!scope.allUnits || openUnit?.id === balance.unitId}
              highlightCostId={highlighted}
            />
          ))
        )}
      </section>
    </div>
  );
}
