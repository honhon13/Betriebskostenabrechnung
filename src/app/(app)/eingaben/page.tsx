import { Pencil, Send } from "lucide-react";
import type { Metadata } from "next";

import {
  updateOwnCostAction,
  updateOwnDocumentAction,
  updateOwnPaymentAction,
} from "@/app/actions/submissions";
import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { CostFields } from "@/components/billing/cost-fields";
import { CreditBadge } from "@/components/billing/credit-badge";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { DocumentFields } from "@/components/documents/document-fields";
import { DocumentChips, DocumentPreviewButton } from "@/components/documents/document-preview";
import { FormDialog } from "@/components/forms/form-dialog";
import { PaymentFields } from "@/components/payments/payment-fields";
import { ReviewBadge } from "@/components/review/review-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { isCredit } from "@/lib/billing/allocation";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { listCategories } from "@/services/masterdata.service";
import { listSubmittablePeriods } from "@/services/periods.service";
import {
  listOwnSubmissions,
  type OwnCostDto,
  type OwnPaymentDto,
} from "@/services/submissions.service";
import type { DocumentDto, PeriodDto, ReviewInfo } from "@/types/billing";

export const metadata: Metadata = { title: "Meine Eingaben" };

/** Prüfstand samt Datum und Kommentar der Verwaltung. */
function ReviewCell({ item }: { item: ReviewInfo }) {
  return (
    <div className="space-y-1">
      <ReviewBadge status={item.reviewStatus} />
      {item.reviewedAt ? (
        <p className="text-xs text-muted">geprüft am {formatDateTime(item.reviewedAt)}</p>
      ) : null}
      {item.reviewComment ? (
        <p className="max-w-64 text-xs break-words text-muted">„{item.reviewComment}“</p>
      ) : null}
    </div>
  );
}

/**
 * Eigene Einträge eines Benutzers: einreichen, Prüfstand verfolgen, nachbessern.
 * Alles hier zählt erst nach Freigabe durch die Verwaltung.
 */
export default async function SubmissionsPage() {
  const user = await requireUser();
  const allowed = {
    period: can(user, "period:submit"),
    cost: can(user, "cost:submit"),
    payment: can(user, "payment:submit"),
    document: can(user, "document:submit"),
  };
  if (!Object.values(allowed).some(Boolean)) return <NoAccess />;

  const [own, periods, categories] = await Promise.all([
    listOwnSubmissions(user),
    listSubmittablePeriods(user),
    listCategories(),
  ]);
  // Kosten lassen sich nur in Jahre einreichen, deren Abrechnung noch nicht veröffentlicht ist.
  const draftPeriods = periods.filter((p) => p.status === "draft");
  const periodOptions = periods.map((p) => ({ id: p.id, year: p.year }));
  const formOptions = { periods: periodOptions, units: [], categories, ...own.linkOptions };

  const costColumns: Column<OwnCostDto>[] = [
    {
      key: "position",
      header: "Position",
      mobile: false,
      cell: (cost) => (
        <>
          <span className="font-medium">{cost.description}</span>
          <span className="block text-xs text-muted">
            {[cost.categoryName, cost.supplier].filter(Boolean).join(" · ")}
          </span>
          {isCredit(cost.amountCents) ? <CreditBadge className="mt-1" /> : null}
        </>
      ),
    },
    { key: "year", header: "Jahr", cell: (cost) => cost.year },
    { key: "date", header: "Datum", cell: (cost) => formatDate(cost.costDate), className: "whitespace-nowrap" },
    { key: "documents", header: "Belege", cell: (cost) => <DocumentChips documents={cost.documents} /> },
    { key: "review", header: "Status", cell: (cost) => <ReviewCell item={cost} /> },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (cost) => <span className="font-medium">{formatCents(cost.amountCents)}</span>,
    },
  ];

  const paymentColumns: Column<OwnPaymentDto>[] = [
    { key: "date", header: "Datum", mobile: false, cell: (p) => formatDate(p.paymentDate), className: "whitespace-nowrap" },
    { key: "year", header: "Jahr", cell: (p) => p.year },
    { key: "purpose", header: "Beschreibung", cell: (p) => p.purpose ?? <span className="text-subtle">–</span> },
    { key: "documents", header: "Nachweis", cell: (p) => <DocumentChips documents={p.documents} /> },
    { key: "review", header: "Status", cell: (p) => <ReviewCell item={p} /> },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (p) => <span className="font-medium">{formatCents(p.amountCents)}</span>,
    },
  ];

  const documentColumns: Column<DocumentDto>[] = [
    {
      key: "file",
      header: "Dokument",
      mobile: false,
      className: "md:min-w-52",
      cell: (document) => (
        <>
          <DocumentPreviewButton document={document} variant="link" />
          {document.description ? (
            <span className="block text-xs text-muted">{document.description}</span>
          ) : null}
        </>
      ),
    },
    { key: "type", header: "Typ", cell: (d) => <Badge tone="primary">{DOCUMENT_TYPE_LABELS[d.type]}</Badge> },
    { key: "year", header: "Jahr", cell: (d) => d.year },
    {
      key: "links",
      header: "Zuordnung",
      cell: (d) =>
        d.costs.length + d.payments.length === 0 ? (
          <span className="text-subtle">–</span>
        ) : (
          <ul className="space-y-0.5">
            {d.costs.map((cost) => (
              <li key={`c${cost.id}`}>{cost.label}</li>
            ))}
            {d.payments.map((payment) => (
              <li key={`p${payment.id}`}>Einzahlung {payment.label}</li>
            ))}
          </ul>
        ),
    },
    { key: "review", header: "Status", cell: (d) => <ReviewCell item={d} /> },
  ];

  const periodColumns: Column<PeriodDto>[] = [
    { key: "year", header: "Abrechnungsjahr", mobile: false, cell: (p) => <span className="font-medium">{p.year}</span> },
    { key: "notes", header: "Notiz", cell: (p) => p.notes ?? <span className="text-subtle">–</span> },
    {
      key: "status",
      header: "Stand der Abrechnung",
      cell: (p) => (p.reviewStatus === "approved" ? <PeriodStatusBadge status={p.status} /> : "–"),
    },
    { key: "review", header: "Status", cell: (p) => <ReviewCell item={p} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meine Eingaben"
        description="Kosten, Einzahlungen, Dokumente und Abrechnungsjahre, die du eingereicht hast."
      >
        <AddButton user={user} area="submissions" />
      </PageHeader>

      <Alert tone="info" title="So funktioniert die Prüfung">
        Deine Eingaben erhalten den Status „Ausstehende Prüfung“ und zählen erst in Abrechnung und
        Salden, wenn die Verwaltung sie freigibt. Änderst du einen bereits freigegebenen Eintrag,
        wird er erneut geprüft. Löschen kann nur die Verwaltung.
      </Alert>

      {allowed.cost ? (
        <Card>
          <CardHeader
            title="Kosten"
            description={`${own.costs.length} eingereichte ${own.costs.length === 1 ? "Position" : "Positionen"}`}
          />
          {own.costs.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Noch keine Kosten eingereicht"
              description={
                draftPeriods.length === 0
                  ? "Es gibt derzeit kein offenes Abrechnungsjahr, in das du Kosten einreichen kannst."
                  : "Reiche Rechnungen ein, die du für das Haus bezahlt hast."
              }
            />
          ) : (
            <div className="pt-3">
              <DataTable
                caption="Eingereichte Kosten"
                rows={own.costs}
                columns={costColumns}
                rowKey={(cost) => cost.id}
                mobileTitle={(cost) => (
                  <>
                    {cost.description}
                    <span className="block text-xs font-normal text-muted">{cost.categoryName}</span>
                  </>
                )}
                mobileValue={(cost) => formatCents(cost.amountCents)}
                actions={(cost) =>
                  // In einer veröffentlichten Abrechnung ändert sich nichts mehr.
                  cost.periodStatus === "draft" ? (
                    <FormDialog
                      trigger={<Pencil aria-hidden />}
                      triggerVariant="ghost"
                      triggerSize="icon"
                      triggerLabel={`${cost.description} bearbeiten`}
                      title="Eingereichte Kosten bearbeiten"
                      description="Nach dem Speichern wird der Eintrag erneut geprüft."
                      action={updateOwnCostAction.bind(null, cost.id)}
                    >
                      <CostFields
                        submission
                        periods={[{ id: cost.periodId, year: cost.year }]}
                        periodId={cost.periodId}
                        categories={categories}
                        allocationKeys={[]}
                        units={[]}
                        cost={cost}
                        allowUpload={allowed.document}
                      />
                    </FormDialog>
                  ) : null
                }
              />
            </div>
          )}
        </Card>
      ) : null}

      {allowed.payment ? (
        <Card>
          <CardHeader
            title="Einzahlungen"
            description={`${own.payments.length} eingereichte ${own.payments.length === 1 ? "Einzahlung" : "Einzahlungen"}`}
          />
          {own.payments.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Noch keine Einzahlungen eingereicht"
              description="Erfasse Zahlungen, die du geleistet hast – am besten mit Nachweis."
            />
          ) : (
            <div className="pt-3">
              <DataTable
                caption="Eingereichte Einzahlungen"
                rows={own.payments}
                columns={paymentColumns}
                rowKey={(payment) => payment.id}
                mobileTitle={(payment) => formatDate(payment.paymentDate)}
                mobileValue={(payment) => formatCents(payment.amountCents)}
                actions={(payment) => (
                  <FormDialog
                    trigger={<Pencil aria-hidden />}
                    triggerVariant="ghost"
                    triggerSize="icon"
                    triggerLabel={`Einzahlung vom ${formatDate(payment.paymentDate)} bearbeiten`}
                    title="Eingereichte Einzahlung bearbeiten"
                    description="Nach dem Speichern wird der Eintrag erneut geprüft."
                    action={updateOwnPaymentAction.bind(null, payment.id)}
                  >
                    <PaymentFields
                      submission
                      periods={[{ id: payment.periodId, year: payment.year }]}
                      units={[]}
                      payment={payment}
                      allowUpload={allowed.document}
                    />
                  </FormDialog>
                )}
              />
            </div>
          )}
        </Card>
      ) : null}

      {allowed.document ? (
        <Card>
          <CardHeader
            title="Dokumente"
            description={`${own.documents.length} hochgeladene ${own.documents.length === 1 ? "Datei" : "Dateien"}`}
          />
          {own.documents.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Noch keine Dokumente eingereicht"
              description="Lade Rechnungen, Zahlungsnachweise oder andere Unterlagen hoch."
            />
          ) : (
            <div className="pt-3">
              <DataTable
                caption="Eingereichte Dokumente"
                rows={own.documents}
                columns={documentColumns}
                rowKey={(document) => document.id}
                mobileTitle={(document) => <DocumentPreviewButton document={document} variant="link" />}
                actions={(document) => (
                  <FormDialog
                    trigger={<Pencil aria-hidden />}
                    triggerVariant="ghost"
                    triggerSize="icon"
                    triggerLabel={`${document.fileName} bearbeiten`}
                    title="Eingereichtes Dokument bearbeiten"
                    description="Nach dem Speichern wird der Eintrag erneut geprüft."
                    action={updateOwnDocumentAction.bind(null, document.id)}
                  >
                    <DocumentFields
                      submission
                      lockPeriod
                      {...formOptions}
                      defaultPeriodId={document.periodId}
                      document={document}
                    />
                  </FormDialog>
                )}
              />
            </div>
          )}
        </Card>
      ) : null}

      {allowed.period && own.periods.length > 0 ? (
        <Card>
          <CardHeader title="Abrechnungsjahre" description="Von dir vorgeschlagene Jahre." />
          <div className="pt-3">
            <DataTable
              caption="Vorgeschlagene Abrechnungsjahre"
              rows={own.periods}
              columns={periodColumns}
              rowKey={(period) => period.id}
              mobileTitle={(period) => `Abrechnungsjahr ${period.year}`}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
