"use client";

import { Download, ExternalLink, Eye, FileImage, FileText } from "lucide-react";
import { useState } from "react";

import { Dialog } from "@/components/forms/dialog";
import { buttonClass } from "@/components/ui/button";
import { documentUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import type { DocumentRef } from "@/types/billing";

/** Formate, die jeder gängige Browser ohne Zusatz direkt anzeigen kann. */
const INLINE_IMAGES = ["image/jpeg", "image/png", "image/webp"];

interface DocumentPreviewButtonProps {
  document: DocumentRef;
  /** chip = Dateiname als kompakte Schaltfläche, icon = nur Symbol, link = Dateiname als Textlink. */
  variant?: "chip" | "icon" | "link";
  className?: string;
}

/**
 * Öffnet ein Dokument in einer Vorschau. Die Datei kommt über die geschützte Route –
 * was der Benutzer nicht sehen darf, lädt auch hier nicht.
 */
export function DocumentPreviewButton({
  document,
  variant = "chip",
  className,
}: DocumentPreviewButtonProps) {
  const [open, setOpen] = useState(false);
  const isImage = document.mimeType.startsWith("image/");
  const Icon = isImage ? FileImage : FileText;
  const url = documentUrl(document.id);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Vorschau ${document.fileName}`}
          title="Vorschau"
          className={buttonClass("ghost", "icon", className)}
        >
          <Eye aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Vorschau: ${document.fileName}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring",
            variant === "chip"
              ? "h-7 rounded-md border border-border bg-surface px-2 text-xs hover:bg-surface-muted"
              : "rounded font-medium underline-offset-4 hover:underline",
            className,
          )}
        >
          <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden />
          {/* Dateinamen haben oft keine Leerzeichen – sie dürfen an jeder Stelle umbrechen. */}
          <span className={variant === "chip" ? "max-w-40 truncate" : "min-w-0 wrap-anywhere"}>
            {document.fileName}
          </span>
        </button>
      )}

      {open ? (
        <Dialog title={document.fileName} onClose={() => setOpen(false)} className="max-w-4xl">
          <div className="min-h-0 flex-1 overflow-auto bg-surface-muted">
            {document.mimeType === "application/pdf" ? (
              <iframe src={url} title={document.fileName} className="h-[70dvh] w-full" />
            ) : INLINE_IMAGES.includes(document.mimeType) ? (
              // Geschützte, dynamische Route – next/image kann und soll hier nicht optimieren.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={document.fileName}
                className="mx-auto max-h-[70dvh] w-auto object-contain"
              />
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted">
                Für dieses Dateiformat gibt es keine Vorschau im Browser. Bitte lade die Datei herunter.
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
            <a href={url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              <ExternalLink aria-hidden />
              In neuem Tab öffnen
            </a>
            <a href={documentUrl(document.id, true)} className={buttonClass("primary", "sm")}>
              <Download aria-hidden />
              Herunterladen
            </a>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** Dokumente einer Kostenposition oder Einzahlung als anklickbare Chips. */
export function DocumentChips({
  documents,
  empty = "–",
}: {
  documents: DocumentRef[];
  empty?: string;
}) {
  if (documents.length === 0) return <span className="text-subtle">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1 md:justify-start">
      {documents.map((document) => (
        <DocumentPreviewButton key={document.id} document={document} />
      ))}
    </span>
  );
}
