"use client";

import { ChevronRight, Plus } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";

import { Dialog } from "@/components/forms/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Ein Eintrag im „Hinzufügen“-Menü – auf dem Server zusammengestellt (siehe add-actions.tsx). */
export interface AddMenuItem {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  /** Warum der Eintrag gerade nicht möglich ist – er steht dann deaktiviert mit dieser Erklärung im Menü. */
  blocked?: string;
  /** Dialog, der sich bei Auswahl öffnet. Er schließt sich über `useAddDialog().close`. */
  dialog: ReactNode;
}

const AddDialogContext = createContext<{ close: () => void } | null>(null);

/** Für Dialoge, die aus dem „Hinzufügen“-Menü geöffnet werden. */
export function useAddDialog(): { close: () => void } {
  const context = use(AddDialogContext);
  if (!context) throw new Error("useAddDialog nur innerhalb von <AddMenu> verwenden.");
  return context;
}

const MENU = "menu";

/**
 * Schaltfläche „Hinzufügen“: zeigt, was sich in der aktuellen Ansicht anlegen lässt, und
 * öffnet den Dialog der gewählten Aktion. Auf dem Handy erscheint die Auswahl als Sheet von unten.
 */
export function AddMenu({ items }: { items: AddMenuItem[] }) {
  // null = geschlossen, MENU = Auswahl, sonst der Schlüssel der gewählten Aktion.
  const [open, setOpen] = useState<string | null>(null);
  const active = items.find((item) => item.key === open);
  // Gibt es nur eine Möglichkeit, öffnet sich deren Dialog ohne Umweg über die Auswahl.
  const only = items.length === 1 && !items[0].blocked ? items[0] : null;

  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => setOpen(only ? only.key : MENU)}>
        <Plus aria-hidden />
        Hinzufügen
      </Button>

      {open === MENU ? (
        <Dialog
          title="Hinzufügen"
          description="Was möchtest du anlegen?"
          onClose={() => setOpen((current) => (current === MENU ? null : current))}
          className="max-w-md"
        >
          <ul className="space-y-2 overflow-y-auto p-3 sm:p-4">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  // aria-disabled statt disabled: der Eintrag bleibt erreichbar, damit die Erklärung lesbar ist.
                  aria-disabled={item.blocked ? true : undefined}
                  onClick={() => (item.blocked ? undefined : setOpen(item.key))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    item.blocked
                      ? "cursor-not-allowed bg-surface-muted"
                      : "hover:border-border-strong hover:bg-surface-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
                      item.blocked ? "bg-surface text-subtle" : "bg-primary-soft text-primary",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm font-medium", item.blocked && "text-muted")}>
                      {item.label}
                    </span>
                    <span className="block text-sm text-muted">{item.blocked ?? item.hint}</span>
                  </span>
                  {item.blocked ? null : (
                    <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}

      {active ? (
        <AddDialogContext value={{ close: () => setOpen(null) }}>{active.dialog}</AddDialogContext>
      ) : null}
    </>
  );
}
