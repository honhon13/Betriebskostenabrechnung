import { CircleCheck, CircleX, Clock, Pencil, Trash2, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { deletePaymentAction, updatePaymentAction } from "@/app/actions/payments";
import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { BalanceBadge } from "@/components/billing/balance-badge";
import { DocumentChips } from "@/components/documents/document-preview";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { NavSelect } from "@/components/layout/year-select";
import { PaymentFields } from "@/components/payments/payment-fields";
import { ReviewFlag } from "@/components/review/review-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents, formatDate } from "@/lib/format";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUSES } from "@/lib/labels";
import { isOcrAvailable } from "@/services/documents.service";
import { listUnits } from "@/services/masterdata.service";
import { listPayments } from "@/services/payments.service";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";
import { getStatement } from "@/services/statement.service";
import type { PaymentDto, PaymentStatus } from "@/types/billing";

export const metadata: Metadata = { title: "Einzahlungen" };

// Beim Speichern mit Beleg läuft die OCR mit – sie wartet auf Azure.
export const maxDuration = 60;

const ALL = "alle";

/** Schlüssel für den Status-Filter in der URL (?status=offen). */
const STATUS_PARAM: Record<PaymentStatus, string> = {
  received: "eingegangen",
  pending: "offen",
  cancelled: "storniert",
};

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

  const { jahr, top, status: statusParam } = await searchParams;
  const [periods, units] = await Promise.all([listPeriods(user), listUnits(user)]);
  const scope = getDataScope(user);

  // Filter liegen in der URL: ?jahr=2025&top=2 – ohne Angabe das laufende Jahr, alle TOPs.
  const period =
    jahr === ALL ? null : (periods.find((p) => p.year === Number(jahr)) ?? pickDefaultPeriod(periods));
  const unit = scope.allUnits ? units.find((u) => String(u.number) === top) : undefined;

  const status = PAYMENT_STATUSES.find((s) => STATUS_PARAM[s] === statusParam);

  const [payments, statement] = await Promise.all([
    listPayments(user, { periodId: period?.id, unitId: unit?.id, status }),
    // Guthaben/Nachzahlung je TOP gibt es nur bezogen auf ein Abrechnungsjahr.
    period && can(user, "cost:read") ? getStatement(user, period.id) : null,
  ]);
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
  const statusValue = status ? STATUS_PARAM[status] : ALL;
  // Alle Filter bleiben beim Wechsel eines einzelnen erhalten.
  const href = (overrides: { jahr?: string; top?: string; status?: string }) => {
    const query = new URLSearchParams({
      jahr: overrides.jahr ?? yearValue,
      top: overrides.top ?? topValue,
      status: overrides.status ?? statusValue,
    });
    return `/einzahlungen?${query.toString().replace(/%7B/g, "{").replace(/%7D/g, "}")}`;
  };

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
        <NavSelect
          label="Zahlungsstatus"
          value={statusValue}
          options={[
            { value: ALL, label: "Alle Status" },
            ...PAYMENT_STATUSES.map((s) => ({ value: STATUS_PARAM[s], label: PAYMENT_STATUS_LABELS[s] })),
          ]}
          hrefPattern={href({ status: "{value}" })}
        />
        <AddButton user={user} area="payments" period={period} unitId={unit?.id} />
      </PageHeader>

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
          description={`${payments.length} ${payments.length === 1 ? "Einzahlung" : "Einzahlungen"} · ${formatCents(total)} eingegangen`}
        />
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Keine Einzahlungen"
            description={
              periods.length === 0
                ? "Es gibt noch kein sichtbares Abrechnungsjahr."
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
