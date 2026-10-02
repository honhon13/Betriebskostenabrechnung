import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import type { Metadata } from "next";

import {
  createPaymentAction,
  deletePaymentAction,
  updatePaymentAction,
} from "@/app/actions/payments";
import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { NavSelect } from "@/components/layout/year-select";
import { PaymentFields } from "@/components/payments/payment-fields";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents, formatDate, todayIso } from "@/lib/format";
import { listUnits } from "@/services/masterdata.service";
import { listPayments } from "@/services/payments.service";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";
import type { PaymentDto } from "@/types/billing";

export const metadata: Metadata = { title: "Einzahlungen" };

const ALL = "alle";

export default async function PaymentsPage({ searchParams }: PageProps<"/einzahlungen">) {
  const user = await requireUser();
  if (!can(user, "payment:read") || !can(user, "period:read")) return <NoAccess />;

  const { jahr, top } = await searchParams;
  const [periods, units] = await Promise.all([listPeriods(user), listUnits(user)]);
  const scope = getDataScope(user);

  // Filter liegen in der URL: ?jahr=2025&top=2 – ohne Angabe das laufende Jahr, alle TOPs.
  const period =
    jahr === ALL ? null : (periods.find((p) => p.year === Number(jahr)) ?? pickDefaultPeriod(periods));
  const unit = scope.allUnits ? units.find((u) => String(u.number) === top) : undefined;

  const payments = await listPayments(user, { periodId: period?.id, unitId: unit?.id });
  const total = payments.reduce((acc, payment) => acc + payment.amountCents, 0);

  const canWrite = can(user, "payment:write") && periods.length > 0 && units.length > 0;
  const canDelete = can(user, "payment:delete");
  const yearValue = period ? String(period.year) : ALL;
  const topValue = unit ? String(unit.number) : ALL;

  const columns: Column<PaymentDto>[] = [
    { key: "date", header: "Datum", cell: (p) => formatDate(p.paymentDate), className: "whitespace-nowrap" },
    { key: "unit", header: "TOP", mobile: false, cell: (p) => <span className="font-medium">{p.unitName}</span> },
    { key: "year", header: "Abrechnungsjahr", cell: (p) => p.year },
    { key: "purpose", header: "Verwendungszweck", cell: (p) => p.purpose ?? <span className="text-subtle">–</span> },
    {
      key: "note",
      header: "Notiz",
      cell: (p) =>
        p.note ? <span className="break-words">{p.note}</span> : <span className="text-subtle">–</span>,
    },
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
            hrefPattern={`/einzahlungen?jahr={value}${unit ? `&top=${unit.number}` : ""}`}
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
            hrefPattern={`/einzahlungen?jahr=${yearValue}&top={value}`}
          />
        ) : null}
        {canWrite ? (
          <FormDialog
            trigger={
              <>
                <Plus aria-hidden />
                Einzahlung erfassen
              </>
            }
            triggerVariant="primary"
            title="Einzahlung erfassen"
            action={createPaymentAction}
          >
            <PaymentFields
              periods={periods}
              units={units}
              defaults={{
                periodId: (period ?? pickDefaultPeriod(periods))?.id,
                unitId: unit?.id,
                date: todayIso(),
              }}
            />
          </FormDialog>
        ) : null}
      </PageHeader>

      <Card>
        <CardHeader
          title={period ? `Einzahlungen ${period.year}` : "Einzahlungen aller Jahre"}
          description={`${payments.length} ${payments.length === 1 ? "Einzahlung" : "Einzahlungen"} · ${formatCents(total)}`}
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
                            <PaymentFields periods={periods} units={units} payment={payment} />
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
                  <td colSpan={5} className="px-3 py-2.5 pl-5">
                    Summe
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
