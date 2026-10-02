import { Download, FileText, Paperclip, Pencil, ScanText, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import {
  deleteReceiptAction,
  runReceiptOcrAction,
  updateReceiptAction,
} from "@/app/actions/receipts";
import { can, getDataScope } from "@/auth/rbac";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { ReceiptMetaFields, type CostOption } from "@/components/receipts/receipt-meta-fields";
import { ReceiptUpload } from "@/components/receipts/receipt-upload";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState } from "@/components/ui/page";
import { formatCents, formatDate, formatFileSize } from "@/lib/format";
import { listCosts } from "@/services/costs.service";
import { loadPeriodPage } from "@/services/page-context";
import { isOcrAvailable, listReceipts } from "@/services/receipts.service";
import { isStoragePersistent } from "@/services/storage";
import type { OcrStatus, ReceiptDto } from "@/types/billing";

export const metadata: Metadata = { title: "Belege" };

// Die OCR-Auswertung wartet auf Azure – dafür reicht das Standard-Zeitlimit nicht immer.
export const maxDuration = 60;

const OCR_LABEL: Record<OcrStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  none: { label: "Nicht ausgelesen", tone: "neutral" },
  pending: { label: "Läuft", tone: "warning" },
  done: { label: "Ausgelesen", tone: "success" },
  failed: { label: "Fehlgeschlagen", tone: "danger" },
};

export default async function ReceiptsPage({ params }: PageProps<"/abrechnung/[jahr]/belege">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "receipt:read")) return <NoAccess />;

  const allUnits = getDataScope(user).allUnits;
  const canWrite = allUnits && can(user, "receipt:write");
  const canDelete = allUnits && can(user, "receipt:delete");
  const canOcr = allUnits && can(user, "receipt:ocr");
  const ocrAvailable = isOcrAvailable();

  const [receipts, costs] = await Promise.all([
    listReceipts(user, period.id),
    canWrite && can(user, "cost:read") ? listCosts(user, period.id) : [],
  ]);
  const costOptions: CostOption[] = costs.map((cost) => ({
    id: cost.id,
    label: `${cost.categoryName} – ${cost.description} (${formatCents(cost.amountCents)})`,
  }));

  const columns: Column<ReceiptDto>[] = [
    {
      key: "file",
      header: "Datei",
      mobile: false,
      cell: (receipt) => (
        <a
          href={`/api/belege/${receipt.id}/datei`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-64 items-start gap-2 font-medium underline-offset-4 hover:underline"
        >
          <FileText className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
          <span className="min-w-0 break-words">
            {receipt.fileName}
            <span className="block text-xs font-normal text-muted">
              {formatFileSize(receipt.sizeBytes)}
            </span>
          </span>
        </a>
      ),
    },
    {
      key: "cost",
      header: "Kostenposition",
      cell: (receipt) =>
        receipt.costLabel ?? <span className="text-subtle">Nicht zugeordnet</span>,
    },
    { key: "date", header: "Belegdatum", cell: (receipt) => formatDate(receipt.documentDate), className: "whitespace-nowrap" },
    {
      key: "supplier",
      header: "Lieferant",
      cell: (receipt) => (
        <>
          {receipt.supplier ?? "–"}
          {receipt.invoiceNumber ? (
            <span className="block text-xs text-muted">Nr. {receipt.invoiceNumber}</span>
          ) : null}
        </>
      ),
    },
    ...(canOcr
      ? [
          {
            key: "ocr",
            header: "OCR",
            cell: (receipt: ReceiptDto) => (
              <Badge tone={OCR_LABEL[receipt.ocrStatus].tone}>{OCR_LABEL[receipt.ocrStatus].label}</Badge>
            ),
          },
        ]
      : []),
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (receipt) =>
        receipt.amountCents === null ? (
          <span className="text-subtle">–</span>
        ) : (
          <span className="font-medium">{formatCents(receipt.amountCents)}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card>
          <CardHeader
            title="Beleg hochladen"
            description="Rechnungen und Vorschreibungen als PDF oder Foto."
          />
          <CardContent className="space-y-4">
            {!isStoragePersistent() ? (
              <Alert tone="warning" title="Kein dauerhafter Speicher eingerichtet">
                Verbinde einen privaten Vercel-Blob-Store mit dem Projekt, damit Uploads möglich sind.
              </Alert>
            ) : null}
            <ReceiptUpload periodId={period.id} costs={costOptions} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Belege"
          description={
            allUnits
              ? `${receipts.length} ${receipts.length === 1 ? "Beleg" : "Belege"} im Abrechnungsjahr ${period.year}`
              : "Belege zu den Kostenpositionen, an denen deine TOP beteiligt ist."
          }
        />
        {canOcr && !ocrAvailable ? (
          <div className="px-4 pt-3 sm:px-5">
            <Alert tone="info" title="OCR ist noch nicht eingerichtet">
              Mit den Umgebungsvariablen AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT und
              AZURE_DOCUMENT_INTELLIGENCE_KEY lassen sich Datum, Rechnungsnummer, Lieferant und Betrag
              automatisch auslesen.
            </Alert>
          </div>
        ) : null}
        {receipts.length === 0 ? (
          <EmptyState
            icon={Paperclip}
            title="Noch keine Belege"
            description={
              allUnits
                ? "Lade den ersten Beleg hoch und ordne ihn einer Kostenposition zu."
                : "Für dieses Abrechnungsjahr wurden noch keine Belege bereitgestellt."
            }
          />
        ) : (
          <div className="pt-3">
            <DataTable
              caption={`Belege ${period.year}`}
              rows={receipts}
              columns={columns}
              rowKey={(receipt) => receipt.id}
              mobileTitle={(receipt) => (
                <a
                  href={`/api/belege/${receipt.id}/datei`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all underline-offset-4 hover:underline"
                >
                  {receipt.fileName}
                </a>
              )}
              mobileValue={(receipt) =>
                receipt.amountCents === null ? null : formatCents(receipt.amountCents)
              }
              actions={(receipt) => (
                <>
                  <a
                    href={`/api/belege/${receipt.id}/datei?download`}
                    className={buttonClass("ghost", "icon")}
                    aria-label={`${receipt.fileName} herunterladen`}
                    title="Herunterladen"
                  >
                    <Download aria-hidden />
                  </a>
                  {canOcr && ocrAvailable ? (
                    <ConfirmAction
                      trigger={<ScanText aria-hidden />}
                      triggerLabel={`${receipt.fileName} per OCR auslesen`}
                      title="Beleg per OCR auslesen?"
                      description="Die Datei wird zur Texterkennung an Azure Document Intelligence übertragen. Erkannte Werte ergänzen nur leere Felder."
                      confirmLabel="Auslesen"
                      action={runReceiptOcrAction.bind(null, receipt.id)}
                    />
                  ) : null}
                  {canWrite ? (
                    <FormDialog
                      trigger={<Pencil aria-hidden />}
                      triggerVariant="ghost"
                      triggerSize="icon"
                      triggerLabel={`${receipt.fileName} bearbeiten`}
                      title="Beleg bearbeiten"
                      description={receipt.fileName}
                      action={updateReceiptAction.bind(null, receipt.id)}
                    >
                      {receipt.ocr ? (
                        <Alert tone="info" title="Von OCR erkannt">
                          {[
                            receipt.ocr.documentDate && `Datum ${formatDate(receipt.ocr.documentDate)}`,
                            receipt.ocr.invoiceNumber && `Nr. ${receipt.ocr.invoiceNumber}`,
                            receipt.ocr.supplier,
                            receipt.ocr.amountCents !== null && formatCents(receipt.ocr.amountCents),
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Keine Felder erkannt."}
                        </Alert>
                      ) : null}
                      <ReceiptMetaFields costs={costOptions} receipt={receipt} />
                    </FormDialog>
                  ) : null}
                  {canDelete ? (
                    <ConfirmAction
                      trigger={<Trash2 aria-hidden />}
                      triggerLabel={`${receipt.fileName} löschen`}
                      title="Beleg löschen?"
                      description={<>„{receipt.fileName}“ wird samt Datei endgültig gelöscht.</>}
                      confirmLabel="Löschen"
                      destructive
                      action={deleteReceiptAction.bind(null, receipt.id)}
                    />
                  ) : null}
                </>
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
