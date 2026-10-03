"use client";

import { useState } from "react";

import { ReceiptCapture, type ReceiptField } from "@/components/documents/receipt-capture";
import { Field } from "@/components/forms/field";
import { Checkbox, fileInputClass, Input, Select, Textarea } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import type { AllocationKeyDto, CategoryDto, CostDto, UnitDto } from "@/types/billing";

interface CostFieldsProps {
  /** Abrechnungsjahre, in denen noch erfasst werden darf (Entwürfe). */
  periods: { id: number; year: number }[];
  /** Jahr der Seite – Vorauswahl für neue Kostenpositionen. */
  periodId: number;
  categories: CategoryDto[];
  allocationKeys: AllocationKeyDto[];
  units: UnitDto[];
  /** Vorhandene Kostenposition beim Bearbeiten. */
  cost?: Pick<
    CostDto,
    | "periodId"
    | "categoryId"
    | "description"
    | "amountCents"
    | "costDate"
    | "supplier"
    | "invoiceNumber"
    | "notes"
    | "documents"
  > &
    Partial<
      Pick<
        CostDto,
        | "allocationKeyId"
        | "unitIds"
        | "servicePeriodStart"
        | "servicePeriodEnd"
        | "netAmountCents"
        | "taxAmountCents"
      >
    >;
  /** Beleg-Upload anbieten (setzt das Recht zum Hochladen voraus). */
  allowUpload?: boolean;
  /** OCR ist eingerichtet – ein Beleg wird sofort ausgelesen und füllt die leeren Felder. */
  ocrAvailable?: boolean;
  /**
   * Einreichen durch Benutzer: Umlageschlüssel und TOP-Zuordnung legt die Verwaltung bei
   * der Prüfung fest und stehen daher nicht im Formular.
   */
  submission?: boolean;
}

/** Was sich aus einem erkannten Beleg in die Felder des Kostenformulars übernehmen lässt. */
const RECEIPT_FIELDS: ReceiptField[] = [
  { name: "supplier", label: "Rechnungssteller", from: (ocr) => ocr.supplier },
  { name: "invoiceNumber", label: "Rechnungsnummer", from: (ocr) => ocr.invoiceNumber },
  { name: "costDate", label: "Rechnungsdatum", from: (ocr) => ocr.documentDate },
  { name: "servicePeriodStart", label: "Leistungszeitraum von", from: (ocr) => ocr.servicePeriodStart },
  { name: "servicePeriodEnd", label: "Leistungszeitraum bis", from: (ocr) => ocr.servicePeriodEnd },
  { name: "description", label: "Beschreibung", from: (ocr) => ocr.description?.slice(0, 200) ?? null },
  { name: "netAmount", label: "Netto", from: (ocr) => centsToInput(ocr.netAmountCents) || null },
  { name: "taxAmount", label: "MwSt.", from: (ocr) => centsToInput(ocr.taxAmountCents) || null },
  { name: "amount", label: "Betrag (brutto)", from: (ocr) => centsToInput(ocr.amountCents) || null },
];

/**
 * Formularfelder einer Kostenposition: Beleg, Kostenart, Rechnungsdaten, Umlageschlüssel und
 * TOP-Zuordnung. Die Verwaltung fotografiert bzw. wählt den Beleg zuerst – erkannte Werte
 * stehen dann schon in den Feldern.
 */
export function CostFields({
  periods,
  periodId,
  categories,
  allocationKeys,
  units,
  cost,
  allowUpload = false,
  ocrAvailable = false,
  submission = false,
}: CostFieldsProps) {
  // Inaktive Einträge nur anbieten, wenn die Position sie bereits verwendet.
  const categoryOptions = categories.filter((c) => c.isActive || c.id === cost?.categoryId);
  const keyOptions = allocationKeys.filter((k) => k.isActive || k.id === cost?.allocationKeyId);

  const initialCategory = cost?.categoryId ?? categoryOptions[0]?.id;
  const defaultKeyOf = (categoryId: number | undefined) =>
    categories.find((c) => c.id === categoryId)?.defaultAllocationKeyId ?? keyOptions[0]?.id;

  const [keyId, setKeyId] = useState(cost?.allocationKeyId ?? defaultKeyOf(initialCategory));
  // Sobald der Schlüssel von Hand gewählt wurde, überschreibt ihn die Kostenart nicht mehr.
  const [keyTouched, setKeyTouched] = useState(Boolean(cost));
  // Leistungszeitraum, Netto und MwSt. sind selten von Hand nötig – aufgeklappt, sobald es Werte gibt.
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(
      cost?.servicePeriodStart ||
        cost?.servicePeriodEnd ||
        (cost?.netAmountCents ?? null) !== null ||
        (cost?.taxAmountCents ?? null) !== null,
    ),
  );
  // Die Verwaltung lädt den Beleg direkt im Formular hoch; eingereichte Belege gehen mit dem Formular mit.
  const capture = allowUpload && !submission;
  const moreReceipts = Boolean(cost && cost.documents.length > 0);

  return (
    <>
      {capture ? (
        <ReceiptCapture
          label={moreReceipts ? "Weiteren Beleg anhängen" : "Beleg"}
          fields={RECEIPT_FIELDS}
          ocr={ocrAvailable}
          onRecognized={() => setDetailsOpen(true)}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Kostenart" name="categoryId">
          <Select
            name="categoryId"
            defaultValue={initialCategory}
            onChange={(event) => {
              if (!keyTouched) setKeyId(defaultKeyOf(Number(event.target.value)));
            }}
            required
          >
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Abrechnungsjahr" name="periodId">
          {/* Eingereichte Positionen bleiben beim Bearbeiten in ihrem Jahr. */}
          <Select
            name="periodId"
            defaultValue={cost?.periodId ?? periodId}
            required
            aria-readonly={submission && Boolean(cost)}
            className={submission && cost ? "pointer-events-none opacity-70" : undefined}
            tabIndex={submission && cost ? -1 : undefined}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.year}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Beschreibung" name="description">
        <Input name="description" defaultValue={cost?.description} maxLength={200} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Betrag (€)" name="amount" hint="Brutto. Gutschriften mit Minus, z. B. -50,00">
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={centsToInput(cost?.amountCents)}
            required
          />
        </Field>
        <Field label="Rechnungsdatum" name="costDate" optional>
          <Input name="costDate" type="date" defaultValue={cost?.costDate ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rechnungssteller" name="supplier" optional>
          <Input name="supplier" defaultValue={cost?.supplier ?? ""} maxLength={200} />
        </Field>
        <Field label="Rechnungsnummer" name="invoiceNumber" optional>
          <Input name="invoiceNumber" defaultValue={cost?.invoiceNumber ?? ""} maxLength={100} />
        </Field>
      </div>

      <details
        className="rounded-lg border border-border"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="flex h-10 cursor-pointer list-none items-center px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          Leistungszeitraum, Netto und MwSt.
        </summary>
        <div className="space-y-4 border-t border-border p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Leistungszeitraum von" name="servicePeriodStart" optional>
              <Input
                name="servicePeriodStart"
                type="date"
                defaultValue={cost?.servicePeriodStart ?? ""}
              />
            </Field>
            <Field label="Leistungszeitraum bis" name="servicePeriodEnd" optional>
              <Input name="servicePeriodEnd" type="date" defaultValue={cost?.servicePeriodEnd ?? ""} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Netto (€)" name="netAmount" optional>
              <Input
                name="netAmount"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsToInput(cost?.netAmountCents)}
              />
            </Field>
            <Field label="MwSt. (€)" name="taxAmount" optional>
              <Input
                name="taxAmount"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsToInput(cost?.taxAmountCents)}
              />
            </Field>
          </div>
        </div>
      </details>

      {submission ? null : (
        <>
        <Field
          label="Umlageschlüssel"
          name="allocationKeyId"
          hint="Bestimmt, in welchem Verhältnis der Betrag auf die TOPs verteilt wird."
        >
          <Select
            name="allocationKeyId"
            value={keyId}
            onChange={(event) => {
              setKeyId(Number(event.target.value));
              setKeyTouched(true);
            }}
            required
          >
            {keyOptions.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name}
                {key.unitLabel ? ` (${key.unitLabel})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">TOP-Zuordnung</legend>
          <div className="flex flex-wrap gap-2">
            {units.map((unit) => (
              <label
                key={unit.id}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-3 text-sm has-checked:border-primary has-checked:bg-primary-soft"
              >
                <Checkbox
                  name="unitIds"
                  value={unit.id}
                  defaultChecked={cost?.unitIds ? cost.unitIds.includes(unit.id) : true}
                />
                {unit.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-subtle">
            Nur die ausgewählten TOPs tragen diese Kosten. Eine einzelne TOP = direkte Zuordnung.
          </p>
        </fieldset>
        </>
      )}

      <Field label="Notiz" name="notes" optional>
        <Textarea name="notes" defaultValue={cost?.notes ?? ""} rows={2} />
      </Field>

      {allowUpload && !capture ? (
        <Field
          label={moreReceipts ? "Weiteren Beleg anhängen" : "Beleg"}
          name="file"
          optional
          hint={`PDF oder Foto bis ${formatFileSize(MAX_UPLOAD_BYTES)} – wird als Rechnung mit dieser Kostenposition verknüpft.`}
        >
          <input type="file" name="file" accept={UPLOAD_ACCEPT} className={fileInputClass} />
        </Field>
      ) : null}
    </>
  );
}
