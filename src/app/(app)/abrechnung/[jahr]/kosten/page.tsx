import { Lock, Pencil, ReceiptText, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import { deleteCostAction, updateCostAction } from "@/app/actions/billing";
import { can, getDataScope } from "@/auth/rbac";
import { CostFields } from "@/components/billing/cost-fields";
import { DocumentChips } from "@/components/documents/document-preview";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { ReviewFlag } from "@/components/review/review-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState } from "@/components/ui/page";
import { formatCents, formatDate } from "@/lib/format";
import { listCosts } from "@/services/costs.service";
import { isOcrAvailable } from "@/services/documents.service";
import { listAllocationKeys, listCategories, listUnits } from "@/services/masterdata.service";
import { loadPeriodPage } from "@/services/page-context";
import { listPeriods } from "@/services/periods.service";
import type { CostDto } from "@/types/billing";

export const metadata: Metadata = { title: "Kosten" };

// Beim Speichern mit Beleg läuft die OCR mit – sie wartet auf Azure.
export const maxDuration = 60;

/** Leistungszeitraum, Netto und MwSt. einer Position – soweit angegeben. */
function invoiceDetails(cost: CostDto): string {
  const period =
    cost.servicePeriodStart || cost.servicePeriodEnd
      ? `Leistung ${[cost.servicePeriodStart, cost.servicePeriodEnd]
          .map((date) => (date ? formatDate(date) : "…"))
          .join(" – ")}`
      : null;
  return [
    period,
    cost.netAmountCents === null ? null : `netto ${formatCents(cost.netAmountCents)}`,
    cost.taxAmountCents === null ? null : `MwSt. ${formatCents(cost.taxAmountCents)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function CostsPage({
  params,
  searchParams,
}: PageProps<"/abrechnung/[jahr]/kosten">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "cost:read") || !getDataScope(user).allUnits) return <NoAccess />;

  const [costs, categories, allocationKeys, units, periods] = await Promise.all([
    listCosts(user, period.id),
    listCategories(),
    listAllocationKeys(),
    listUnits(user),
    listPeriods(user),
  ]);
  // ?position=12 – Sprungziel aus der Dokumentenverwaltung.
  const highlighted = Number((await searchParams).position);
  // Kosten lassen sich nur in Jahren erfassen, die noch nicht freigegeben sind.
  const draftPeriods = periods
    .filter((p) => p.status === "draft")
    .map((p) => ({ id: p.id, year: p.year }));
  const allowUpload = can(user, "document:write");
  const ocrAvailable = can(user, "document:ocr") && isOcrAvailable();

  const draft = period.status === "draft";
  const canWrite = draft && can(user, "cost:write");
  const canDelete = draft && can(user, "cost:delete");
  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));
  // Eingereichte, noch nicht freigegebene Positionen stehen in der Liste, zählen aber nicht mit.
  const official = costs.filter((cost) => cost.reviewStatus === "approved");
  const total = official.reduce((acc, cost) => acc + cost.amountCents, 0);
  const unreviewed = costs.length - official.length;

  const columns: Column<CostDto>[] = [
    { key: "date", header: "Datum", cell: (cost) => formatDate(cost.costDate), className: "whitespace-nowrap" },
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
          {invoiceDetails(cost) ? (
            <span className="block text-xs text-muted">{invoiceDetails(cost)}</span>
          ) : null}
          {cost.reviewStatus !== "approved" ? (
            <span className="mt-1 block">
              <ReviewFlag status={cost.reviewStatus} />
            </span>
          ) : null}
        </>
      ),
    },
    { key: "key", header: "Schlüssel", cell: (cost) => cost.allocationKeyName },
    {
      key: "units",
      header: "TOPs",
      cell: (cost) =>
        cost.unitIds.length === units.length ? (
          "Alle"
        ) : (
          <span className="inline-flex flex-wrap justify-end gap-1">
            {cost.unitIds.map((id) => (
              <Badge key={id}>{unitName.get(id)}</Badge>
            ))}
          </span>
        ),
    },
    {
      key: "documents",
      header: "Belege",
      cell: (cost) => <DocumentChips documents={cost.documents} />,
    },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (cost) => <span className="font-medium">{formatCents(cost.amountCents)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {!draft ? (
        <Alert tone="info" title="Diese Abrechnung ist freigegeben">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3.5" aria-hidden />
            Kosten sind gesperrt. Nimm die Freigabe zurück, um sie zu ändern.
          </span>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Kostenpositionen"
          description={
            `${official.length} ${official.length === 1 ? "Position" : "Positionen"} · ${formatCents(total)}` +
            (unreviewed > 0 ? ` · ${unreviewed} eingereicht, nicht freigegeben` : "")
          }
        />
        {costs.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Noch keine Kosten"
            description={
              canWrite
                ? "Lege über „Hinzufügen“ Rechnungen und Vorschreibungen mit Kostenart, Betrag und Umlageschlüssel an."
                : "In diesem Abrechnungsjahr gibt es keine Kostenpositionen."
            }
          />
        ) : (
          <div className="pt-3">
            <DataTable
              caption={`Kostenpositionen ${period.year}`}
              rows={costs}
              columns={columns}
              rowKey={(cost) => cost.id}
              highlight={(cost) => cost.id === highlighted}
              mobileTitle={(cost) => (
                <>
                  {cost.description}
                  <span className="block text-xs font-normal text-muted">{cost.categoryName}</span>
                  <ReviewFlag status={cost.reviewStatus} />
                </>
              )}
              mobileValue={(cost) => formatCents(cost.amountCents)}
              actions={
                canWrite || canDelete
                  ? (cost) => (
                      <>
                        {canWrite ? (
                          <FormDialog
                            trigger={<Pencil aria-hidden />}
                            triggerVariant="ghost"
                            triggerSize="icon"
                            triggerLabel={`${cost.description} bearbeiten`}
                            title="Kosten bearbeiten"
                            action={updateCostAction.bind(null, cost.id)}
                          >
                            <CostFields
                              periods={draftPeriods}
                              periodId={period.id}
                              categories={categories}
                              allocationKeys={allocationKeys}
                              units={units}
                              cost={cost}
                              allowUpload={allowUpload}
                              ocrAvailable={ocrAvailable}
                            />
                          </FormDialog>
                        ) : null}
                        {canDelete ? (
                          <ConfirmAction
                            trigger={<Trash2 aria-hidden />}
                            triggerLabel={`${cost.description} löschen`}
                            title="Kostenposition löschen?"
                            description={
                              <>
                                „{cost.description}“ über {formatCents(cost.amountCents)} wird
                                gelöscht. Verknüpfte Dokumente bleiben erhalten.
                              </>
                            }
                            confirmLabel="Löschen"
                            destructive
                            action={deleteCostAction.bind(null, cost.id)}
                          />
                        ) : null}
                      </>
                    )
                  : undefined
              }
              footer={
                <tr className="font-semibold">
                  <td colSpan={5} className="px-3 py-2.5 pl-5">
                    Summe{unreviewed > 0 ? " (freigegebene Positionen)" : ""}
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
