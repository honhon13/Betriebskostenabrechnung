import { Field } from "@/components/forms/field";
import { fileInputClass, Input, Select, Textarea } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUSES } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { PaymentDto, UnitDto } from "@/types/billing";

interface PaymentFieldsProps {
  periods: { id: number; year: number }[];
  units: UnitDto[];
  payment?: Pick<
    PaymentDto,
    "periodId" | "paymentDate" | "amountCents" | "purpose" | "note" | "documents"
  > &
    Partial<Pick<PaymentDto, "unitId" | "status">>;
  /** Vorbelegung für neue Einzahlungen. */
  defaults?: { periodId?: number; unitId?: number; date?: string };
  /** Nachweis-Upload anbieten (setzt das Recht zum Hochladen voraus). */
  allowUpload?: boolean;
  /** OCR ist eingerichtet – der Nachweis wird beim Speichern automatisch ausgelesen. */
  ocrAvailable?: boolean;
  /** Einreichen durch Benutzer: immer für die eigene TOP, ohne Zahlungsstatus. */
  submission?: boolean;
}

export function PaymentFields({
  periods,
  units,
  payment,
  defaults,
  allowUpload = false,
  ocrAvailable = false,
  submission = false,
}: PaymentFieldsProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Datum" name="paymentDate">
          <Input
            name="paymentDate"
            type="date"
            defaultValue={payment?.paymentDate ?? defaults?.date ?? ""}
            required
          />
        </Field>
        <Field label="Betrag (€)" name="amount" hint="Rückzahlungen mit Minus.">
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={centsToInput(payment?.amountCents)}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {submission ? null : (
          <Field label="TOP" name="unitId">
            <Select name="unitId" defaultValue={payment?.unitId ?? defaults?.unitId} required>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Abrechnungsjahr" name="periodId">
          <Select name="periodId" defaultValue={payment?.periodId ?? defaults?.periodId} required>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.year}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {submission ? (
        <Field label="Beschreibung / Verwendungszweck" name="purpose" optional>
          <Input name="purpose" defaultValue={payment?.purpose ?? ""} maxLength={200} />
        </Field>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Beschreibung / Verwendungszweck" name="purpose" optional>
              <Input name="purpose" defaultValue={payment?.purpose ?? ""} maxLength={200} />
            </Field>
            <Field label="Zahlungsstatus" name="status">
              <Select name="status" defaultValue={payment?.status ?? "received"}>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PAYMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="-mt-2 text-xs text-subtle">
            Nur eingegangene Zahlungen zählen in der Abrechnung. „Offen“ merkt eine erwartete Zahlung
            vor.
          </p>
        </>
      )}
      <Field label="Notiz" name="note" optional>
        <Textarea name="note" defaultValue={payment?.note ?? ""} rows={2} />
      </Field>
      {allowUpload ? (
        <Field
          label={payment && payment.documents.length > 0 ? "Weiteren Nachweis anhängen" : "Nachweis"}
          name="file"
          optional
          hint={`Kontoauszug oder Beleg als PDF/Foto bis ${formatFileSize(MAX_UPLOAD_BYTES)}${
            ocrAvailable ? " – wird automatisch per OCR ausgelesen." : "."
          }`}
        >
          <input type="file" name="file" accept={UPLOAD_ACCEPT} className={fileInputClass} />
        </Field>
      ) : null}
    </>
  );
}
