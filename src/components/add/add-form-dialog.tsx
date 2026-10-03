"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { Dialog } from "@/components/forms/dialog";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/input";

import { useAddDialog } from "./add-menu";

interface AddFormDialogProps {
  title: string;
  description?: ReactNode;
  action: FormAction;
  submitLabel?: string;
  /** „Weiteren Eintrag anlegen“ anbieten – nicht sinnvoll, wenn die Action woandershin weiterleitet. */
  allowAnother?: boolean;
  /**
   * Seite, auf der das Angelegte steht. Liegt die aktuelle Ansicht woanders, führt der Dialog
   * nach dem Speichern dorthin – der neue Eintrag ist dann sofort in seiner Liste zu sehen.
   */
  listHref?: string;
  children: ReactNode;
}

/** Formular-Dialog einer „Hinzufügen“-Aktion. Auf Wunsch bleibt er für den nächsten Eintrag offen. */
export function AddFormDialog({
  title,
  description,
  action,
  submitLabel = "Speichern",
  allowAnother = true,
  listHref,
  children,
}: AddFormDialogProps) {
  const { close } = useAddDialog();
  const router = useRouter();
  const pathname = usePathname();
  const [another, setAnother] = useState(false);
  // Zahl der in diesem Dialog gespeicherten Einträge – zugleich key für ein frisches Formular.
  const [saved, setSaved] = useState(0);

  function finish(savedNow: boolean) {
    close();
    if ((savedNow || saved > 0) && listHref && pathname !== listHref) router.push(listHref);
  }

  return (
    <Dialog title={title} description={description} onClose={() => finish(false)}>
      <ActionForm
        key={saved}
        action={action}
        submitLabel={submitLabel}
        onSuccess={() => (another ? setSaved((count) => count + 1) : finish(true))}
        onCancel={() => finish(false)}
        cancelLabel={saved > 0 ? "Fertig" : "Abbrechen"}
        className="min-h-0 flex-1 px-5 pt-4"
        footerClassName="-mx-5 mt-4 border-t border-border px-5 py-3"
        footerStart={
          allowAnother ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              <Checkbox checked={another} onChange={(event) => setAnother(event.target.checked)} />
              Weiteren Eintrag anlegen
            </label>
          ) : null
        }
      >
        {saved > 0 ? (
          <Alert
            tone="success"
            title={`Gespeichert – ${saved} ${saved === 1 ? "Eintrag" : "Einträge"} angelegt. Hier folgt der nächste.`}
          />
        ) : null}
        {children}
      </ActionForm>
    </Dialog>
  );
}
