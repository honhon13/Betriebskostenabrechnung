import { Field } from "@/components/forms/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import type { PaymentDto, PeriodDto, UnitDto } from "@/types/billing";

interface PaymentFieldsProps {
  periods: PeriodDto[];
  units: UnitDto[];
  payment?: PaymentDto;
  /** Vorbelegung für neue Einzahlungen. */
  defaults?: { periodId?: number; unitId?: number; date?: string };
}

export function PaymentFields({ periods, units, payment, defaults }: PaymentFieldsProps) {
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
        <Field label="TOP" name="unitId">
          <Select name="unitId" defaultValue={payment?.unitId ?? defaults?.unitId} required>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </Field>
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
      <Field label="Verwendungszweck" name="purpose" optional>
        <Input name="purpose" defaultValue={payment?.purpose ?? ""} maxLength={200} />
      </Field>
      <Field label="Notiz" name="note" optional>
        <Textarea name="note" defaultValue={payment?.note ?? ""} rows={2} />
      </Field>
    </>
  );
}
