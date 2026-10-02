"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition, type ReactNode, type SubmitEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

import { FieldErrorsContext } from "./field";

export type FormAction = (formData: FormData) => Promise<ActionState>;

interface ActionFormProps {
  action: FormAction;
  submitLabel: string;
  children: ReactNode;
  /** Wird nach erfolgreichem Speichern aufgerufen, z. B. um einen Dialog zu schließen. */
  onSuccess?: (state: ActionState) => void;
  onCancel?: () => void;
  /** Erfolgsmeldung im Formular anzeigen (für Formulare, die offen bleiben). */
  showSuccess?: boolean;
  /** Felder nach Erfolg leeren (z. B. Passwortformular). */
  resetOnSuccess?: boolean;
  submitVariant?: "primary" | "danger";
  className?: string;
  footerClassName?: string;
}

/**
 * Formular für Server Actions. Die Action wird bewusst über onSubmit aufgerufen
 * statt über <form action>: so bleiben die Eingaben bei einem Fehler stehen.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  onSuccess,
  onCancel,
  showSuccess = false,
  resetOnSuccess = false,
  submitVariant = "primary",
  className,
  footerClassName,
}: ActionFormProps) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result?.ok) {
        if (resetOnSuccess) form.reset();
        onSuccess?.(result);
      }
    });
  }

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("flex min-h-0 flex-col", className)}>
      <FieldErrorsContext value={fieldErrors}>
        <div className="-m-1 min-h-0 space-y-4 overflow-y-auto p-1">
          {children}
          {state && !state.ok ? <Alert tone="danger" title={state.error} /> : null}
          {state?.ok && showSuccess ? (
            <Alert tone="success" title={state.message ?? "Gespeichert."} />
          ) : null}
        </div>
      </FieldErrorsContext>
      <div className={cn("flex flex-wrap justify-end gap-2 pt-4", footerClassName)}>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Abbrechen
          </Button>
        ) : null}
        <Button type="submit" variant={submitVariant} disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
