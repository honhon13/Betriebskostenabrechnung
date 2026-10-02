"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Modaler Dialog auf Basis des nativen <dialog>: Fokusfalle, Escape und
 * Hintergrund-Sperre kommen vom Browser. Wird nur gerendert, solange er offen ist.
 */
export function Dialog({ title, description, onClose, children, className }: DialogProps) {
  return (
    <dialog
      ref={(element) => {
        if (element && !element.open) element.showModal();
      }}
      onClose={onClose}
      onClick={(event) => {
        // Klick auf den abgedunkelten Hintergrund schließt den Dialog.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "modal max-h-[92dvh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-surface p-0 shadow-xl sm:rounded-2xl",
        className,
      )}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="dialog-title" className="text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <form method="dialog">
            <button
              aria-label="Schließen"
              className="-mr-2 flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </form>
        </div>
        {children}
      </div>
    </dialog>
  );
}
