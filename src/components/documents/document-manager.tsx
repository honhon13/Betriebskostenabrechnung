import { Download, Files, Pencil, ScanText, Search, Send, Trash2, X } from "lucide-react";
import Link from "next/link";

import {
  deleteDocumentAction,
  runDocumentOcrAction,
  updateDocumentAction,
} from "@/app/actions/documents";
import { can, getDataScope } from "@/auth/rbac";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FilterForm } from "@/components/forms/filter-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";
import { documentUrl } from "@/lib/files";
import { formatCents, formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/lib/labels";
import {
  isOcrAvailable,
  listDocuments,
  listLinkOptions,
  type DocumentSort,
} from "@/services/documents.service";
import { listUnits } from "@/services/masterdata.service";
import { pickDefaultPeriod } from "@/services/periods.service";
import type { SessionUser } from "@/types/auth";
import type { DocumentDto, OcrFields, PeriodDto } from "@/types/billing";

import { DocumentFields, type DocumentFormOptions } from "./document-fields";
import { DocumentPreviewButton } from "./document-preview";
import { OcrStatusBadge } from "./ocr-status";
import { ReviewFlag } from "../review/review-badge";
import { DocumentUploadDialog } from "./document-upload";

const ALL = "alle";

const SORT_LABELS: Record<DocumentSort, string> = {
  newest: "Neueste zuerst",
  oldest: "Älteste zuerst",
  name: "Dateiname A–Z",
};

/** Von der OCR erkannte Werte als kurze Aufzählung – für den Hinweis im Bearbeiten-Dialog. */
function describeOcr(ocr: OcrFields): string {
  return (
    [
      ocr.supplier,
      ocr.invoiceNumber && `Nr. ${ocr.invoiceNumber}`,
      ocr.documentDate && `Datum ${formatDate(ocr.documentDate)}`,
      (ocr.servicePeriodStart || ocr.servicePeriodEnd) &&
        `Leistung ${formatDate(ocr.servicePeriodStart)} – ${formatDate(ocr.servicePeriodEnd)}`,
      ocr.netAmountCents !== null && `netto ${formatCents(ocr.netAmountCents)}`,
      ocr.taxAmountCents !== null &&
        `MwSt. ${formatCents(ocr.taxAmountCents)}${ocr.taxRate ? ` (${ocr.taxRate})` : ""}`,
      ocr.amountCents !== null && `brutto ${formatCents(ocr.amountCents)}`,
      ocr.description,
    ]
      .filter(Boolean)
      .join(" · ") || "Keine Rechnungsdaten erkannt."
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

const param = (params: SearchParams, name: string) => {
  const value = params[name];
  return typeof value === "string" ? value : undefined;
};

interface DocumentManagerProps {
  user: SessionUser;
  periods: PeriodDto[];
  /** Im Reiter eines Abrechnungsjahres ist das Jahr vorgegeben und nicht filterbar. */
  lockedPeriod?: PeriodDto;
  /** Pfad der Seite – Ziel der Filterleiste. */
  basePath: string;
  searchParams: SearchParams;
}

/**
 * Dokumentenverwaltung: Suche, Filter, Sortierung, Vorschau, Download und – für die
 * Verwaltung – Upload, Bearbeiten, OCR und Löschen. Wird zentral unter /dokumente und
 * als Reiter je Abrechnungsjahr verwendet.
 */
export async function DocumentManager({
  user,
  periods,
  lockedPeriod,
  basePath,
  searchParams,
}: DocumentManagerProps) {
  const scope = getDataScope(user);
  const canWrite = scope.allUnits && can(user, "document:write");
  const canDelete = scope.allUnits && can(user, "document:delete");
  const canOcr = scope.allUnits && can(user, "document:ocr");
  const ocrAvailable = isOcrAvailable();

  // Filter aus der URL lesen – unbekannte Werte fallen auf „alle“ zurück.
  const search = param(searchParams, "q")?.trim() ?? "";
  const period = lockedPeriod ?? periods.find((p) => String(p.year) === param(searchParams, "jahr"));
  const type = DOCUMENT_TYPES.find((t) => t === param(searchParams, "typ"));
  const sort = (Object.keys(SORT_LABELS) as DocumentSort[]).find((s) => s === param(searchParams, "sort")) ?? "newest";

  const units = await listUnits(user);
  const unit = scope.allUnits
    ? units.find((u) => String(u.number) === param(searchParams, "top"))
    : undefined;

  const [documents, linkOptions] = await Promise.all([
    listDocuments(user, { periodId: period?.id, unitId: unit?.id, type, search, sort }),
    canWrite ? listLinkOptions(user) : { costs: [], payments: [] },
  ]);

  const formOptions: DocumentFormOptions = {
    periods: periods.map((p) => ({ id: p.id, year: p.year })),
    units,
    ...linkOptions,
  };
  const defaultPeriodId = (period ?? pickDefaultPeriod(periods))?.id;
  const filtered = Boolean(search || type || unit || (!lockedPeriod && period) || sort !== "newest");

  const costHref = (document: DocumentDto, costId: number) =>
    scope.allUnits
      ? `/abrechnung/${document.year}/kosten?position=${costId}`
      : `/abrechnung/${document.year}?position=${costId}`;

  const columns: Column<DocumentDto>[] = [
    {
      key: "file",
      header: "Dokument",
      mobile: false,
      // Mindestbreite, damit Dateinamen an Bindestrichen statt mitten im Wort umbrechen.
      className: "md:min-w-52",
      cell: (document) => (
        <div className="max-w-72">
          <DocumentPreviewButton document={document} variant="link" />
          <span className="block text-xs text-muted">
            {[document.description, formatFileSize(document.sizeBytes)].filter(Boolean).join(" · ")}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Typ",
      cell: (document) => (
        <span className="inline-flex flex-wrap justify-end gap-1 md:justify-start">
          <Badge tone="primary">{DOCUMENT_TYPE_LABELS[document.type]}</Badge>
          <ReviewFlag status={document.reviewStatus} />
        </span>
      ),
    },
    ...(lockedPeriod
      ? []
      : [{ key: "year", header: "Jahr", cell: (document: DocumentDto) => document.year }]),
    {
      key: "links",
      header: "Zuordnung",
      cell: (document) => {
        const empty =
          document.costs.length === 0 && document.payments.length === 0 && !document.unitName;
        if (empty) return <span className="text-subtle">Nicht zugeordnet</span>;
        return (
          <ul className="space-y-0.5">
            {document.costs.map((cost) => (
              <li key={`c${cost.id}`}>
                <Link href={costHref(document, cost.id)} className="underline-offset-4 hover:underline">
                  {cost.label}
                </Link>
              </li>
            ))}
            {document.payments.map((payment) => (
              <li key={`p${payment.id}`}>
                <Link
                  href={`/einzahlungen?jahr=${document.year}`}
                  className="underline-offset-4 hover:underline"
                >
                  Einzahlung {payment.label}
                </Link>
              </li>
            ))}
            {document.unitName ? (
              <li>
                <Badge>{document.unitName}</Badge>
              </li>
            ) : null}
          </ul>
        );
      },
    },
    {
      key: "details",
      header: "Rechnungsdaten",
      cell: (document) => {
        const lines = [
          [document.supplier, document.invoiceNumber && `Nr. ${document.invoiceNumber}`],
          [
            document.documentDate && formatDate(document.documentDate),
            (document.servicePeriodStart || document.servicePeriodEnd) &&
              `Leistung ${formatDate(document.servicePeriodStart)} – ${formatDate(document.servicePeriodEnd)}`,
          ],
          [
            document.netAmountCents !== null && `netto ${formatCents(document.netAmountCents)}`,
            document.taxAmountCents !== null && `MwSt. ${formatCents(document.taxAmountCents)}`,
            document.amountCents !== null && `brutto ${formatCents(document.amountCents)}`,
          ],
        ]
          .map((parts) => parts.filter(Boolean).join(" · "))
          .filter(Boolean);
        return (
          <div className="space-y-1">
            {lines.length === 0 ? (
              <span className="text-subtle">–</span>
            ) : (
              <ul className="space-y-0.5">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {/* Der OCR-Status ist ein Arbeitsstand der Verwaltung – USER sehen ihn nicht. */}
            {canOcr ? (
              <p className="flex items-center justify-end gap-1.5 text-xs text-muted md:justify-start">
                OCR
                <OcrStatusBadge status={document.ocrStatus} error={document.ocrError} />
              </p>
            ) : null}
          </div>
        );
      },
      className: "md:min-w-56",
    },
    {
      key: "uploaded",
      header: "Hochgeladen",
      cell: (document) => formatDateTime(document.createdAt),
      className: "whitespace-nowrap",
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={lockedPeriod ? `Dokumente ${lockedPeriod.year}` : "Alle Dokumente"}
          description={
            scope.allUnits
              ? `${documents.length} ${documents.length === 1 ? "Dokument" : "Dokumente"}${filtered ? " in dieser Auswahl" : ""}`
              : "Dokumente, die deine TOP betreffen."
          }
          action={
            canWrite && defaultPeriodId !== undefined ? (
              <DocumentUploadDialog
                {...formOptions}
                defaultPeriodId={defaultPeriodId}
                lockPeriod={Boolean(lockedPeriod)}
                ocrAvailable={canOcr && ocrAvailable}
              />
            ) : !canWrite && can(user, "document:submit") ? (
              <Link href="/eingaben" className={buttonClass("secondary", "md")}>
                <Send aria-hidden />
                Dokument einreichen
              </Link>
            ) : null
          }
        />

        <FilterForm
          action={basePath}
          className="flex flex-wrap items-end gap-2 border-b border-border px-4 pt-4 pb-4 sm:px-5"
        >
          <label className="min-w-48 flex-1">
            <span className="sr-only">Suche</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Dateiname, Beschreibung, Rechnungssteller …"
                className="pl-9"
              />
            </span>
          </label>
          {lockedPeriod ? null : (
            <Select name="jahr" aria-label="Abrechnungsjahr" defaultValue={period ? String(period.year) : ALL} className="w-auto">
              <option value={ALL}>Alle Jahre</option>
              {periods.map((p) => (
                <option key={p.id} value={p.year}>
                  {p.year}
                </option>
              ))}
            </Select>
          )}
          {scope.allUnits ? (
            <Select name="top" aria-label="TOP" defaultValue={unit ? String(unit.number) : ALL} className="w-auto">
              <option value={ALL}>Alle TOPs</option>
              {units.map((u) => (
                <option key={u.id} value={u.number}>
                  {u.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select name="typ" aria-label="Dokumenttyp" defaultValue={type ?? ALL} className="w-auto">
            <option value={ALL}>Alle Typen</option>
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select name="sort" aria-label="Sortierung" defaultValue={sort} className="w-auto">
            {(Object.keys(SORT_LABELS) as DocumentSort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Suchen
          </Button>
          {filtered ? (
            <Link href={basePath} className={buttonClass("ghost", "md")}>
              <X aria-hidden />
              Zurücksetzen
            </Link>
          ) : null}
        </FilterForm>

        {canOcr && !ocrAvailable && documents.length > 0 ? (
          <p className="px-4 pt-3 text-xs text-subtle sm:px-5">
            OCR ist nicht eingerichtet – mit AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT und
            AZURE_DOCUMENT_INTELLIGENCE_KEY lassen sich Rechnungsdaten automatisch auslesen.
          </p>
        ) : null}

        {documents.length === 0 ? (
          <EmptyState
            icon={Files}
            title={filtered ? "Keine Treffer" : "Noch keine Dokumente"}
            description={
              filtered
                ? "Für diese Suche bzw. Filter gibt es keine Dokumente."
                : scope.allUnits
                  ? "Lade Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen hoch."
                  : "Sobald die Verwaltung Dokumente für deine TOP bereitstellt, erscheinen sie hier."
            }
          />
        ) : (
          <div className="pt-1">
            <DataTable
              caption="Dokumente"
              rows={documents}
              columns={columns}
              rowKey={(document) => document.id}
              mobileTitle={(document) => (
                <>
                  <DocumentPreviewButton document={document} variant="link" />
                  {document.description ? (
                    <span className="block text-xs font-normal text-muted">{document.description}</span>
                  ) : null}
                </>
              )}
              actions={(document) => (
                <>
                  <DocumentPreviewButton document={document} variant="icon" />
                  <a
                    href={documentUrl(document.id, true)}
                    className={buttonClass("ghost", "icon")}
                    aria-label={`${document.fileName} herunterladen`}
                    title="Herunterladen"
                  >
                    <Download aria-hidden />
                  </a>
                  {canOcr && ocrAvailable ? (
                    <ConfirmAction
                      trigger={<ScanText aria-hidden />}
                      triggerLabel={`${document.fileName} ${document.ocrStatus === "done" ? "erneut " : ""}per OCR auslesen`}
                      title={document.ocrStatus === "done" ? "Erneut per OCR auslesen?" : "Dokument per OCR auslesen?"}
                      description="Die Datei wird zur Texterkennung an Azure Document Intelligence übertragen. Erkannte Werte ergänzen nur leere Felder – bereits Eingetragenes bleibt unverändert."
                      confirmLabel="Auslesen"
                      action={runDocumentOcrAction.bind(null, document.id)}
                    />
                  ) : null}
                  {canWrite ? (
                    <FormDialog
                      trigger={<Pencil aria-hidden />}
                      triggerVariant="ghost"
                      triggerSize="icon"
                      triggerLabel={`${document.fileName} bearbeiten`}
                      title="Dokument bearbeiten"
                      description={document.fileName}
                      action={updateDocumentAction.bind(null, document.id)}
                    >
                      {document.ocrStatus === "failed" ? (
                        <Alert tone="danger" title="OCR-Fehler">
                          {document.ocrError ?? "Die OCR-Auswertung ist fehlgeschlagen."}
                        </Alert>
                      ) : document.ocr ? (
                        <Alert tone="info" title="Von OCR erkannt">
                          {describeOcr(document.ocr)}
                        </Alert>
                      ) : null}
                      <DocumentFields
                        {...formOptions}
                        defaultPeriodId={document.periodId}
                        document={document}
                      />
                    </FormDialog>
                  ) : null}
                  {canDelete ? (
                    <ConfirmAction
                      trigger={<Trash2 aria-hidden />}
                      triggerLabel={`${document.fileName} löschen`}
                      title="Dokument löschen?"
                      description={<>„{document.fileName}“ wird samt Datei endgültig gelöscht.</>}
                      confirmLabel="Löschen"
                      destructive
                      action={deleteDocumentAction.bind(null, document.id)}
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
