import { CalendarPlus } from "lucide-react";

import { createPeriodAction } from "@/app/actions/billing";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { Input, Textarea } from "@/components/ui/input";

interface NewPeriodDialogProps {
  suggestedYear: number;
  variant?: "primary" | "secondary";
}

export function NewPeriodDialog({ suggestedYear, variant = "secondary" }: NewPeriodDialogProps) {
  return (
    <FormDialog
      trigger={
        <>
          <CalendarPlus aria-hidden />
          Neues Jahr
        </>
      }
      triggerVariant={variant}
      title="Abrechnungsjahr anlegen"
      description="Wohnfläche und Personen werden aus den Stammdaten der TOPs übernommen."
      action={createPeriodAction}
      submitLabel="Anlegen"
    >
      <Field label="Jahr" name="year">
        <Input name="year" type="number" inputMode="numeric" defaultValue={suggestedYear} required />
      </Field>
      <Field label="Notiz" name="notes" optional>
        <Textarea name="notes" />
      </Field>
    </FormDialog>
  );
}
