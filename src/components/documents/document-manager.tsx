import { Download, Files, Pencil, ScanText, Trash2 } from "lucide-react";
import Link from "next/link";

import {
  deleteDocumentAction,
  runDocumentOcrAction,
  updateDocumentAction,
} from "@/app/actions/documents";
import { can, getDataScope } from "@/auth/rbac";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  FilterAmountRange,
  FilterDateRange,
  FilterSelect,
} from "@/components/filters/filter-controls";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { inlineLinkClass } from "@/components/ui/interactive";
import { EmptyState } from "@/components/ui/page";
import { documentUrl } from "@/lib/files";
import {
  REVIEW_STATUS_PARAMS,
  countActive,
  readAmount,
  readDate,
  readMapped,
  readNumber,
  readParam,
  type SearchParams,
} from "@/lib/filters";
import { formatCents, formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, REVIEW_STATUS_LABELS } from "@/lib/labels";
import { categoryNote, documentTypeNote } from "@/lib/ocr/classification-text";
import {
  isOcrAvailable,
  listDocuments,
  listLinkOptions,
  type DocumentSort,
} from "@/services/documents.service";
import { listCategories, listUnits } from "@/services/masterdata.service";
import type { SessionUser } from "@/types/auth";
import type { DocumentDto, OcrFields, PeriodDto } from "@/types/billing";

import { DocumentFields, type DocumentFormOptions } from "./document-fields";
import { DocumentPreviewButton } from "./document-preview";
import { OcrStatusBadge } from "./ocr-status";
import { ReviewFlag } from "../review/review-badge";

/** Wert von ?kostenart= für Belege, deren Kostenart noch offen ist. */
const CATEGORY_OPEN = "offen";

/** OCR-Status in der URL (?ocr=…). */
const OCR_PARAMS = { open: "offen", done: "verarbeitet", failed: "fehler" } as const;
const OCR_LABELS = { open: "Offen", done: "Verarbeitet", failed: "Fehler" } as const;

/** Zuordnung in der URL (?zuordnung=ohne). */
const ASSIGNMENT_PARAMS = { assigned: "mit", unassigned: "ohne" } as const;

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
 * Verwaltung – Bearbeiten, OCR und Löschen. Hochgeladen wird über „Hinzufügen“ im Seitenkopf.
 * Wird zentral unter /dokumente und als Reiter je Abrechnungsjahr verwendet.
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
  const search = readParam(searchParams, "q") ?? "";
  const period =
    lockedPeriod ?? periods.find((p) => String(p.year) === readParam(searchParams, "jahr"));
  const type = DOCUMENT_TYPES.find((t) => t === readParam(searchParams, "typ"));
  const sort =
    (Object.keys(SORT_LABELS) as DocumentSort[]).find((s) => s === readParam(searchParams, "sort")) ??
    "newest";

  const [units, categories] = await Promise.all([listUnits(user), listCategories()]);
  const unit = scope.allUnits
    ? units.find((u) => String(u.number) === readParam(searchParams, "top"))
    : undefined;
  const categoryParam = readParam(searchParams, "kostenart");
  const category = categories.find((c) => c.id === readNumber(searchParams, "kostenart"));
  const categoryId = categoryParam === CATEGORY_OPEN ? ("open" as const) : category?.id;
  const reviewStatus = readMapped(searchParams, "pruefung", REVIEW_STATUS_PARAMS);
  // OCR-Status und fehlende Zuordnung sind Arbeitsstände der Verwaltung.
  const ocrStatus = canOcr ? readMapped(searchParams, "ocr", OCR_PARAMS) : undefined;
  const assignment = scope.allUnits
    ? readMapped(searchParams, "zuordnung", ASSIGNMENT_PARAMS)
    : undefined;
  const from = readDate(searchParams, "von");
  const to = readDate(searchParams, "bis");
  const minCents = readAmount(searchParams, "betragAb");
  const maxCents = readAmount(searchParams, "betragBis");

  const [documents, linkOptions] = await Promise.all([
    listDocuments(user, {
      periodId: period?.id,
      unitId: unit?.id,
      type,
      search,
      categoryId,
      reviewStatus,
      ocrStatus,
      assignment,
      from,
      to,
      minCents,
      maxCents,
      sort,
    }),
    canWrite ? listLinkOptions(user) : { costs: [], payments: [] },
  ]);

  const formOptions: DocumentFormOptions = {
    periods: periods.map((p) => ({ id: p.id, year: p.year })),
    units,
    categories,
    ...linkOptions,
  };
  // Die Sortierung ist kein Filter – sie zählt nur fürs Zurücksetzen mit.
  const activeFilters = countActive([
    search,
    type,
    unit,
    !lockedPeriod && period,
    categoryId,
    reviewStatus,
    ocrStatus,
    assignment,
    from,
    to,
    minCents,
    maxCents,
  ]);
  const filtered = activeFilters > 0;

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
          document.costs.length === 0 &&
          document.payments.length === 0 &&
          !document.unitName &&
          !document.categoryName;
        if (empty) return <span className="text-subtle">Nicht zugeordnet</span>;
        return (
          <ul className="space-y-0.5">
            {document.categoryName ? <li>Kostenart: {document.categoryName}</li> : null}
            {document.costs.map((cost) => (
              <li key={`c${cost.id}`}>
                <Link href={costHref(document, cost.id)} className={inlineLinkClass}>
                  {cost.label}
                </Link>
              </li>
            ))}
            {document.payments.map((payment) => (
              <li key={`p${payment.id}`}>
                <Link
                  href={`/einzahlungen?jahr=${document.year}&zahlung=${payment.id}`}
                  className={inlineLinkClass}
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
        />

        <FilterBar
          action={basePath}
          activeCount={activeFilters + (sort === "newest" ? 0 : 1)}
          search={{ value: search, placeholder: "Dateiname, Beschreibung, Rechnungssteller …" }}
        >
          {lockedPeriod ? null : (
            <FilterSelect
              name="jahr"
              label="Abrechnungsjahr"
              value={period?.year}
              allLabel="Alle Jahre"
              options={periods.map((p) => ({ value: p.year, label: String(p.year) }))}
            />
          )}
          {scope.allUnits ? (
            <FilterSelect
              name="top"
              label="TOP"
              value={unit?.number}
              allLabel="Alle TOPs"
              options={units.map((u) => ({ value: u.number, label: u.name }))}
            />
          ) : null}
          <FilterSelect
            name="typ"
            label="Dokumenttyp"
            value={type}
            allLabel="Alle Typen"
            options={DOCUMENT_TYPES.map((value) => ({ value, label: DOCUMENT_TYPE_LABELS[value] }))}
          />
          <FilterSelect
            name="kostenart"
            label="Kostenart"
            value={categoryId === "open" ? CATEGORY_OPEN : categoryId}
            allLabel="Alle Kostenarten"
            options={[
              { value: CATEGORY_OPEN, label: "Offen – noch nicht zugeordnet" },
              ...categories
                .filter((c) => c.isActive || c.id === categoryId)
                .map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <FilterSelect
            name="pruefung"
            label="Prüfstand"
            value={reviewStatus && REVIEW_STATUS_PARAMS[reviewStatus]}
            allLabel="Jeder Prüfstand"
            options={(["approved", "pending", "rejected"] as const).map((status) => ({
              value: REVIEW_STATUS_PARAMS[status],
              label: REVIEW_STATUS_LABELS[status],
            }))}
          />
          {scope.allUnits ? (
            <FilterSelect
              name="zuordnung"
              label="Zuordnung"
              value={assignment && ASSIGNMENT_PARAMS[assignment]}
              allLabel="Mit und ohne Zuordnung"
              options={[
                { value: ASSIGNMENT_PARAMS.assigned, label: "Zugeordnet" },
                { value: ASSIGNMENT_PARAMS.unassigned, label: "Nicht zugeordnet" },
              ]}
            />
          ) : null}
          {canOcr ? (
            <FilterSelect
              name="ocr"
              label="OCR-Status"
              value={ocrStatus && OCR_PARAMS[ocrStatus]}
              allLabel="Jeder OCR-Status"
              options={(Object.keys(OCR_PARAMS) as (keyof typeof OCR_PARAMS)[]).map((status) => ({
                value: OCR_PARAMS[status],
                label: OCR_LABELS[status],
              }))}
            />
          ) : null}
          <FilterDateRange from={from} to={to} subject="Belegdatum, sonst Upload-Datum" />
          <FilterAmountRange min={minCents} max={maxCents} />
          <FilterSelect
            name="sort"
            label="Sortierung"
            value={sort}
            options={(Object.keys(SORT_LABELS) as DocumentSort[]).map((value) => ({
              value,
              label: SORT_LABELS[value],
            }))}
          />
        </FilterBar>

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
                  ? "Lade über „Hinzufügen“ Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen hoch."
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
                          {document.classification ? (
                            <span className="mt-1 block">
                              {[
                                documentTypeNote(document.classification),
                                categoryNote(document.classification, false),
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                          ) : null}
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
