"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

import { Dialog } from "./dialog";

interface ConfirmActionProps {
  trigger: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "sm" | "md" | "icon";
  triggerLabel?: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Löschen & Co. bekommen die rote Schaltfläche. */
  destructive?: boolean;
  action: () => Promise<ActionState>;
  /** Zeigt nach Erfolg ein Ergebnis im Dialog an (z. B. ein neues Passwort), statt zu schließen. */
  renderResult?: (message: string) => ReactNode;
}

/** Schaltfläche mit Rückfrage – für Löschen, Freigeben und andere folgenreiche Aktionen. */
export function ConfirmAction({
  trigger,
  triggerVariant = "ghost",
  triggerSize = "icon",
  triggerLabel,
  title,
  description,
  confirmLabel,
  destructive = false,
  action,
  renderResult,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setState(null);
  }

  function confirm() {
    startTransition(async () => {
      const result = await action();
      setState(result);
      if (result?.ok && !(renderResult && result.message)) close();
    });
  }

  const result = state?.ok && renderResult && state.message ? renderResult(state.message) : null;

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
        <Dialog title={title} onClose={close} className="max-w-md">
          <div className="space-y-4 px-5 py-4">
            {result ?? <div className="text-sm text-muted">{description}</div>}
            {state && !state.ok ? <Alert tone="danger" title={state.error} /> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
            {result ? (
              <Button onClick={close}>Fertig</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={close} disabled={pending}>
                  Abbrechen
                </Button>
                <Button
                  variant={destructive ? "danger" : "primary"}
                  onClick={confirm}
                  disabled={pending}
                >
                  {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                  {confirmLabel}
                </Button>
              </>
            )}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
