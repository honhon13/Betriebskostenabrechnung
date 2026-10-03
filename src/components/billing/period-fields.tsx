import { Field } from "@/components/forms/field";
import { Input, Textarea } from "@/components/ui/input";

/** Formularfelder eines neuen Abrechnungsjahres. */
export function PeriodFields({ suggestedYear }: { suggestedYear: number }) {
  return (
    <>
      <Field label="Jahr" name="year">
        <Input name="year" type="number" inputMode="numeric" defaultValue={suggestedYear} required />
      </Field>
      <Field label="Notiz" name="notes" optional>
        <Textarea name="notes" />
      </Field>
    </>
  );
}
