import { CircleCheck, CircleX, Clock, Pencil, Trash2, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { deletePaymentAction, updatePaymentAction } from "@/app/actions/payments";
import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { BalanceBadge } from "@/components/billing/balance-badge";
import { DocumentChips } from "@/components/documents/document-preview";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  FilterAmountRange,
  FilterDateRange,
  FilterSelect,
} from "@/components/filters/filter-controls";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { NavSelect } from "@/components/layout/year-select";
import { PaymentFields } from "@/components/payments/payment-fields";
import { PaymentsTabs } from "@/components/payments/payments-tabs";
import { ReviewFlag } from "@/components/review/review-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import {
  ALL,
  REVIEW_STATUS_PARAMS,
  countActive,
  readAmount,
  readDate,
  readMapped,
  readNumber,
  readParam,
  withParams,
} from "@/lib/filters";
import { formatCents, formatDate } from "@/lib/format";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUSES, REVIEW_STATUS_LABELS } from "@/lib/labels";
import { filterPayments, type PaymentListFilter } from "@/lib/list-filters";
import { isOcrAvailable } from "@/services/documents.service";
import { listUnits } from "@/services/masterdata.service";
import { listPayments } from "@/services/payments.service";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";
import { getStatement } from "@/services/statement.service";
import type { PaymentDto, PaymentStatus } from "@/types/billing";

export const metadata: Metadata = { title: "Einzahlungen" };

// Beim Speichern mit Beleg läuft die OCR mit – sie wartet auf Azure.
export const maxDuration = 60;

/** Schlüssel für den Status-Filter in der URL (?status=offen). */
const STATUS_PARAM: Record<PaymentStatus, string> = {
  received: "eingegangen",
  pending: "offen",
  cancelled: "storniert",
};

/** Ein- oder Auszahlung in der URL (?art=auszahlung). */
const DIRECTION_PARAM = { in: "einzahlung", out: "auszahlung" } as const;

function StatusBadge({ status }: { status: PaymentStatus }) {
  const label = PAYMENT_STATUS_LABELS[status];
  if (status === "received") {
    return (
      <Badge tone="success" icon={<CircleCheck aria-hidden />}>
        {label}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge tone="warning" icon={<Clock aria-hidden />}>
        {label}
      </Badge>
    );
  }
  return <Badge icon={<CircleX aria-hidden />}>{label}</Badge>;
}

export default async function PaymentsPage({ searchParams }: PageProps<"/einzahlungen">) {
  const user = await requireUser();
  if (!can(user, "payment:read") || !can(user, "period:read")) return <NoAccess />;

  const query = await searchParams;
  const { jahr, top } = query;
  const [periods, units] = await Promise.all([listPeriods(user), listUnits(user)]);
  const scope = getDataScope(user);

  // Jahr und TOP gelten für die ganze Seite: ?jahr=2025&top=2 – ohne Angabe das laufende Jahr,
  // alle TOPs. Die übrigen Filter betreffen nur die Liste.
  const period =
    jahr === ALL ? null : (periods.find((p) => p.year === Number(jahr)) ?? pickDefaultPeriod(periods));
  const unit = scope.allUnits ? units.find((u) => String(u.number) === top) : undefined;

  const status = readMapped(query, "status", STATUS_PARAM);
  const filter: PaymentListFilter = {
    search: readParam(query, "q"),
    reviewStatus: readMapped(query, "pruefung", REVIEW_STATUS_PARAMS),
    direction: readMapped(query, "art", DIRECTION_PARAM),
    from: readDate(query, "von"),
    to: readDate(query, "bis"),
    minCents: readAmount(query, "betragAb"),
    maxCents: readAmount(query, "betragBis"),
  };
  const activeFilters = countActive([status, ...Object.values(filter)]);
  // ?zahlung=12 – Sprungziel aus Dashboard und Abrechnungskonto.
  const highlighted = readNumber(query, "zahlung");

  const [allPayments, statement] = await Promise.all([
    listPayments(user, { periodId: period?.id, unitId: unit?.id, status }),
    // Guthaben/Nachzahlung je TOP gibt es nur bezogen auf ein Abrechnungsjahr.
    period && can(user, "cost:read") ? getStatement(user, period.id) : null,
  ]);
  const payments = filterPayments(allPayments, filter);
  // Summe der eingegangenen Zahlungen – offene und stornierte zählen nicht mit.
  const total = payments
    .filter((payment) => payment.status === "received" && payment.reviewStatus === "approved")
    .reduce((acc, payment) => acc + payment.amountCents, 0);
  const balances = (statement?.balances ?? []).filter((b) => !unit || b.unitId === unit.id);

  const canWrite = can(user, "payment:write") && periods.length > 0 && units.length > 0;
  const canDelete = can(user, "payment:delete");
  const allowUpload = scope.allUnits && can(user, "document:write");
  const ocrAvailable = allowUpload && can(user, "document:ocr") && isOcrAvailable();
  const yearValue = period ? String(period.year) : ALL;
  const topValue = unit ? String(unit.number) : ALL;
  // Beim Wechsel von Jahr oder TOP bleiben die Filter der Liste erhalten.
  const href = (overrides: { jahr?: string; top?: string }) =>
    withParams("/einzahlungen", {
      jahr: overrides.jahr ?? yearValue,
      top: overrides.top ?? topValue,
      q: filter.search,
      status: status && STATUS_PARAM[status],
      pruefung: filter.reviewStatus && REVIEW_STATUS_PARAMS[filter.reviewStatus],
      art: filter.direction && DIRECTION_PARAM[filter.direction],
      von: filter.from,
      bis: filter.to,
      betragAb: readParam(query, "betragAb"),
      betragBis: readParam(query, "betragBis"),
    }).replace("%7Bvalue%7D", "{value}");

  const columns: Column<PaymentDto>[] = [
    { key: "date", header: "Datum", cell: (p) => formatDate(p.paymentDate), className: "whitespace-nowrap" },
    { key: "unit", header: "TOP", mobile: false, cell: (p) => <span className="font-medium">{p.unitName}</span> },
    { key: "year", header: "Abrechnungsjahr", cell: (p) => p.year },
    {
      key: "purpose",
      header: "Beschreibung",
      cell: (p) =>
        p.purpose || p.note ? (
          <>
            {p.purpose}
            {p.note ? <span className="block text-xs break-words text-muted">{p.note}</span> : null}
          </>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => (
        <span className="inline-flex flex-wrap justify-end gap-1 md:justify-start">
          <StatusBadge status={p.status} />
          <ReviewFlag status={p.reviewStatus} />
        </span>
      ),
    },
    { key: "documents", header: "Nachweis", cell: (p) => <DocumentChips documents={p.documents} /> },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (p) => <span className="font-medium">{formatCents(p.amountCents)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Einzahlungen"
        description={
          scope.allUnits
            ? "Akontozahlungen und Nachzahlungen aller TOPs."
            : `Einzahlungen ${user.unitName ?? ""} in freigegebenen Abrechnungsjahren.`
        }
      >
        {periods.length > 0 ? (
          <NavSelect
            label="Abrechnungsjahr"
            value={yearValue}
            options={[
              ...periods.map((p) => ({ value: String(p.year), label: String(p.year) })),
              { value: ALL, label: "Alle Jahre" },
            ]}
            hrefPattern={href({ jahr: "{value}" })}
          />
        ) : null}
        {scope.allUnits ? (
          <NavSelect
            label="TOP"
            value={topValue}
            options={[
              { value: ALL, label: "Alle TOPs" },
              ...units.map((u) => ({ value: String(u.number), label: u.name })),
            ]}
            hrefPattern={href({ top: "{value}" })}
          />
        ) : null}
        <AddButton user={user} area="payments" period={period} unitId={unit?.id} />
      </PageHeader>

      {can(user, "account:read") ? <PaymentsTabs /> : null}

      {period && balances.length > 0 ? (
        <Card>
          <CardHeader
            title={`Stand ${period.year}`}
            description="Einzahlungen minus Kostenanteil = Guthaben bzw. Nachzahlung."
          />
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((balance) => (
              <div key={balance.unitId} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{balance.unitName}</p>
                  <BalanceBadge cents={balance.balanceCents} />
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Einzahlungen</dt>
                    <dd className="tabular-nums">{formatCents(balance.paymentCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Kostenanteil</dt>
                    <dd className="tabular-nums">− {formatCents(balance.costCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
                    <dt>{balance.balanceCents < 0 ? "Nachzahlung" : "Guthaben"}</dt>
                    <dd className="tabular-nums">{formatCents(Math.abs(balance.balanceCents))}</dd>
                  </div>
                  {balance.pendingPaymentCents !== 0 ? (
                    <div className="flex justify-between gap-2 text-xs text-muted">
                      <dt>davon noch offen erwartet</dt>
                      <dd className="tabular-nums">{formatCents(balance.pendingPaymentCents)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={period ? `Einzahlungen ${period.year}` : "Einzahlungen aller Jahre"}
          description={
            `${payments.length} ${payments.length === 1 ? "Einzahlung" : "Einzahlungen"} · ${formatCents(total)} eingegangen` +
            (activeFilters > 0 ? " – in dieser Auswahl" : "")
          }
        />
        {periods.length > 0 ? (
          <FilterBar
            action="/einzahlungen"
            activeCount={activeFilters}
            // Jahr und TOP gehören zur Seite und bleiben beim Filtern wie beim Zurücksetzen stehen.
            keep={{ jahr: yearValue, top: topValue }}
            resetHref={withParams("/einzahlungen", { jahr: yearValue, top: topValue })}
            search={{ value: filter.search ?? "", placeholder: "Beschreibung, Notiz …" }}
          >
            <FilterSelect
              name="status"
              label="Zahlungsstatus"
              value={status && STATUS_PARAM[status]}
              allLabel="Alle Status"
              options={PAYMENT_STATUSES.map((s) => ({
                value: STATUS_PARAM[s],
                label: PAYMENT_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect
              name="pruefung"
              label="Prüfstand"
              value={filter.reviewStatus && REVIEW_STATUS_PARAMS[filter.reviewStatus]}
              allLabel="Jeder Prüfstand"
              options={(["approved", "pending", "rejected"] as const).map((s) => ({
                value: REVIEW_STATUS_PARAMS[s],
                label: REVIEW_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect
              name="art"
              label="Art"
              value={filter.direction && DIRECTION_PARAM[filter.direction]}
              allLabel="Ein- und Auszahlungen"
              options={[
                { value: DIRECTION_PARAM.in, label: "Nur Einzahlungen" },
                { value: DIRECTION_PARAM.out, label: "Nur Auszahlungen" },
              ]}
            />
            <FilterDateRange from={filter.from} to={filter.to} subject="Zahlungsdatum" />
            <FilterAmountRange min={filter.minCents} max={filter.maxCents} />
          </FilterBar>
        ) : null}
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={activeFilters > 0 ? "Keine Treffer" : "Keine Einzahlungen"}
            description={
              periods.length === 0
                ? "Es gibt noch kein sichtbares Abrechnungsjahr."
                : activeFilters > 0
                  ? "Für diese Suche bzw. Filter gibt es keine Einzahlungen."
                  : "Für diese Auswahl sind keine Einzahlungen erfasst."
            }
          />
        ) : (
          <div className="pt-3">
            <DataTable
              caption="Einzahlungen"
              rows={payments}
              columns={columns}
              rowKey={(payment) => payment.id}
              highlight={(payment) => payment.id === highlighted}
              mobileTitle={(payment) => payment.unitName}
              mobileValue={(payment) => formatCents(payment.amountCents)}
              actions={
                canWrite || canDelete
                  ? (payment) => (
                      <>
                        {canWrite ? (
                          <FormDialog
                            trigger={<Pencil aria-hidden />}
                            triggerVariant="ghost"
                            triggerSize="icon"
                            triggerLabel={`Einzahlung vom ${formatDate(payment.paymentDate)} bearbeiten`}
                            title="Einzahlung bearbeiten"
                            action={updatePaymentAction.bind(null, payment.id)}
                          >
                            <PaymentFields
                              periods={periods}
                              units={units}
                              payment={payment}
                              allowUpload={allowUpload}
              ocrAvailable={ocrAvailable}
                            />
                          </FormDialog>
                        ) : null}
                        {canDelete ? (
                          <ConfirmAction
                            trigger={<Trash2 aria-hidden />}
                            triggerLabel={`Einzahlung vom ${formatDate(payment.paymentDate)} löschen`}
                            title="Einzahlung löschen?"
                            description={
                              <>
                                {formatCents(payment.amountCents)} von {payment.unitName} am{" "}
                                {formatDate(payment.paymentDate)} wird gelöscht.
                              </>
                            }
                            confirmLabel="Löschen"
                            destructive
                            action={deletePaymentAction.bind(null, payment.id)}
                          />
                        ) : null}
                      </>
                    )
                  : undefined
              }
              footer={
                <tr className="font-semibold">
                  <td colSpan={6} className="px-3 py-2.5 pl-5">
                    Summe eingegangen
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(total)}</td>
                  {canWrite || canDelete ? <td /> : null}
                </tr>
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
