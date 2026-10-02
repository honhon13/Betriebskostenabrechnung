"use client";

import { useState } from "react";

import { Field } from "@/components/forms/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { DocumentDto, DocumentType, UnitDto } from "@/types/billing";

/** Kostenposition oder Einzahlung, mit der ein Dokument verknüpft werden kann. */
export interface LinkOption {
  id: number;
  periodId: number;
  label: string;
}

/** Alles, was das Formular zur Auswahl anbietet – von der Seite einmal geladen. */
export interface DocumentFormOptions {
  periods: { id: number; year: number }[];
  costs: LinkOption[];
  payments: LinkOption[];
  units: UnitDto[];
}

interface DocumentFieldsProps extends DocumentFormOptions {
  /** Vorauswahl des Abrechnungsjahres für neue Dokumente. */
  defaultPeriodId: number;
  /** true = Jahr ist vorgegeben (z. B. im Reiter eines Abrechnungsjahres). */
  lockPeriod?: boolean;
  document?: DocumentDto;
}

/**
 * Metadaten eines Dokuments: Typ, Abrechnungsjahr, Beschreibung und Verknüpfungen.
 * Kostenpositionen und Einzahlungen richten sich nach dem gewählten Jahr.
 */
export function DocumentFields({
  periods,
  defaultPeriodId,
  lockPeriod = false,
  costs,
  payments,
  units,
  document,
}: DocumentFieldsProps) {
  const [periodId, setPeriodId] = useState(document?.periodId ?? defaultPeriodId);
  const [type, setType] = useState<DocumentType>(document?.type ?? "invoice");

  const linkedCosts = new Set(document?.costs.map((cost) => cost.id));
  const linkedPayment = document?.payments[0]?.id;
  const costOptions = costs.filter((cost) => cost.periodId === periodId);
  const paymentOptions = payments.filter((payment) => payment.periodId === periodId);
  // Die Einzahlung ist vor allem für Zahlungsnachweise relevant – sonst nur zeigen, wenn schon verknüpft.
  const showPayment = type === "payment_proof" || linkedPayment !== undefined;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dokumenttyp" name="type">
          <Select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as DocumentType)}
          >
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        {lockPeriod ? (
          <input type="hidden" name="periodId" value={periodId} />
        ) : (
          <Field label="Abrechnungsjahr" name="periodId">
            <Select
              name="periodId"
              value={periodId}
              onChange={(event) => setPeriodId(Number(event.target.value))}
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.year}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="TOP"
          name="unitId"
          optional
          hint="Nur ausfüllen, wenn das Dokument genau eine TOP betrifft."
          className={lockPeriod ? undefined : "sm:col-span-2"}
        >
          <Select name="unitId" defaultValue={document?.unitId ?? ""}>
            <option value="">Keine – gesamtes Gebäude</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Beschreibung" name="description" optional>
        <Textarea name="description" defaultValue={document?.description ?? ""} rows={2} />
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium">
          Kostenpositionen
          <span className="text-xs font-normal text-subtle">optional</span>
        </legend>
        {costOptions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
            In diesem Abrechnungsjahr gibt es noch keine Kostenpositionen.
          </p>
        ) : (
          // key: bei Jahreswechsel entstehen die Kästchen neu, alte Häkchen wandern nicht mit.
          <div
            key={periodId}
            className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border-strong p-1.5"
          >
            {costOptions.map((cost) => (
              <label
                key={cost.id}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted has-checked:bg-primary-soft"
              >
                <Checkbox
                  name="costIds"
                  value={cost.id}
                  defaultChecked={linkedCosts.has(cost.id)}
                  className="mt-0.5"
                />
                <span className="min-w-0">{cost.label}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-subtle">
          Über die Verknüpfung sehen die beteiligten TOPs das Dokument, sobald das Jahr freigegeben ist.
        </p>
      </fieldset>

      {showPayment ? (
        <Field label="Einzahlung" name="paymentId" optional>
          <Select key={periodId} name="paymentId" defaultValue={linkedPayment ?? ""}>
            <option value="">Keine</option>
            {paymentOptions.map((payment) => (
              <option key={payment.id} value={payment.id}>
                {payment.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <details className="group rounded-lg border border-border" open={Boolean(document)}>
        <summary className="flex h-10 cursor-pointer list-none items-center px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          Rechnungsdaten (Datum, Lieferant, Betrag)
        </summary>
        <div className="space-y-4 border-t border-border p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Belegdatum" name="documentDate" optional>
              <Input name="documentDate" type="date" defaultValue={document?.documentDate ?? ""} />
            </Field>
            <Field label="Betrag (€)" name="amount" optional>
              <Input
                name="amount"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsToInput(document?.amountCents)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lieferant" name="supplier" optional>
              <Input name="supplier" defaultValue={document?.supplier ?? ""} maxLength={200} />
            </Field>
            <Field label="Rechnungsnummer" name="invoiceNumber" optional>
              <Input
                name="invoiceNumber"
                defaultValue={document?.invoiceNumber ?? ""}
                maxLength={100}
              />
            </Field>
          </div>
        </div>
      </details>
    </>
  );
}
