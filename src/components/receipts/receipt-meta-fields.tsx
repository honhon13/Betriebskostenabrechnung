import { Field } from "@/components/forms/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import type { ReceiptDto } from "@/types/billing";

export interface CostOption {
  id: number;
  label: string;
}

interface ReceiptMetaFieldsProps {
  costs: CostOption[];
  receipt?: ReceiptDto;
}

/** Metadaten eines Belegs und seine Zuordnung zu einer Kostenposition. */
export function ReceiptMetaFields({ costs, receipt }: ReceiptMetaFieldsProps) {
  return (
    <>
      <Field
        label="Kostenposition"
        name="costId"
        optional
        hint="Erst mit einer Zuordnung sehen die beteiligten TOPs den Beleg."
      >
        <Select name="costId" defaultValue={receipt?.costId ?? ""}>
          <option value="">Noch nicht zugeordnet</option>
          {costs.map((cost) => (
            <option key={cost.id} value={cost.id}>
              {cost.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Belegdatum" name="documentDate" optional>
          <Input name="documentDate" type="date" defaultValue={receipt?.documentDate ?? ""} />
        </Field>
        <Field label="Betrag (€)" name="amount" optional>
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={centsToInput(receipt?.amountCents)}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lieferant" name="supplier" optional>
          <Input name="supplier" defaultValue={receipt?.supplier ?? ""} maxLength={200} />
        </Field>
        <Field label="Rechnungsnummer" name="invoiceNumber" optional>
          <Input name="invoiceNumber" defaultValue={receipt?.invoiceNumber ?? ""} maxLength={100} />
        </Field>
      </div>
      <Field label="Notiz" name="notes" optional>
        <Textarea name="notes" defaultValue={receipt?.notes ?? ""} rows={2} />
      </Field>
    </>
  );
}
