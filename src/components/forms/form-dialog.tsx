"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { ActionForm, type FormAction } from "./action-form";
import { Dialog } from "./dialog";

interface FormDialogProps {
  /** Inhalt der auslösenden Schaltfläche (Symbol und/oder Text). */
  trigger: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md" | "icon";
  /** Für reine Symbol-Schaltflächen: Beschriftung für Screenreader und Tooltip. */
  triggerLabel?: string;
  title: string;
  description?: ReactNode;
  action: FormAction;
  submitLabel?: string;
  children: ReactNode;
}

/** Schaltfläche, die ein Formular in einem Dialog öffnet und nach dem Speichern schließt. */
export function FormDialog({
  trigger,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerLabel,
  title,
  description,
  action,
  submitLabel = "Speichern",
  children,
}: FormDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>
      {open ? (
        <Dialog title={title} description={description} onClose={() => setOpen(false)}>
          <ActionForm
            action={action}
            submitLabel={submitLabel}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            className="min-h-0 flex-1 px-5 pt-4"
            footerClassName="-mx-5 mt-4 border-t border-border px-5 py-3"
          >
            {children}
          </ActionForm>
        </Dialog>
      ) : null}
    </>
  );
}
