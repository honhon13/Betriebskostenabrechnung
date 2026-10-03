"use client";

import { Check, X } from "lucide-react";

import type { FormAction } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { Textarea } from "@/components/ui/input";

interface ReviewDialogProps {
  decision: "approved" | "rejected";
  /** Was geprüft wird, z. B. „Kehrung und Überprüfung“ – für Titel und Screenreader. */
  subject: string;
  action: FormAction;
  /** Bisheriger Kommentar, z. B. beim erneuten Prüfen. */
  comment?: string | null;
}

/** Freigeben oder Ablehnen eines eingereichten Eintrags, mit optionalem Kommentar. */
export function ReviewDialog({ decision, subject, action, comment }: ReviewDialogProps) {
  const approve = decision === "approved";

  return (
    <FormDialog
      trigger={
        <>
          {approve ? <Check aria-hidden /> : <X aria-hidden />}
          {approve ? "Freigeben" : "Ablehnen"}
        </>
      }
      triggerVariant={approve ? "primary" : "secondary"}
      triggerSize="sm"
      triggerLabel={`${subject} ${approve ? "freigeben" : "ablehnen"}`}
      title={approve ? "Eintrag freigeben?" : "Eintrag ablehnen?"}
      description={
        approve
          ? `„${subject}“ zählt danach offiziell in Abrechnung und Salden.`
          : `„${subject}“ bleibt gespeichert, zählt aber nicht. Der Einreicher sieht die Ablehnung und deinen Kommentar.`
      }
      action={action}
      submitLabel={approve ? "Freigeben" : "Ablehnen"}
    >
      <input type="hidden" name="decision" value={decision} />
      <Field
        label="Kommentar"
        name="comment"
        optional
        hint={approve ? undefined : "Hilft dem Einreicher zu verstehen, was fehlt oder falsch ist."}
      >
        <Textarea name="comment" defaultValue={comment ?? ""} rows={3} maxLength={500} />
      </Field>
    </FormDialog>
  );
}
