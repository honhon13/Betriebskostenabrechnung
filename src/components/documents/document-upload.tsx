"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type SubmitEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fileInputClass } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import { shrinkImage } from "@/lib/image-resize";

import { Dialog } from "../forms/dialog";
import { FieldErrorsContext } from "../forms/field";
import { DocumentFields, type DocumentFormOptions } from "./document-fields";

interface DocumentUploadProps extends DocumentFormOptions {
  defaultPeriodId: number;
  lockPeriod?: boolean;
}

type Status = { tone: "success" | "danger"; message: string } | null;

/** Schaltfläche, die das Upload-Formular in einem Dialog öffnet. */
export function DocumentUploadDialog(props: DocumentUploadProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload aria-hidden />
        Dokument hochladen
      </Button>
      {open ? (
        <Dialog
          title="Dokument hochladen"
          description="Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen."
          onClose={() => setOpen(false)}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <DocumentUpload {...props} />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** Upload-Formular für Dokumente. Die Datei geht per multipart an /api/dokumente. */
function DocumentUpload(props: DocumentUploadProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  // Nach erfolgreichem Upload entstehen die Felder neu (leer, mit Standardwerten) –
  // der Dialog bleibt offen, damit sich mehrere Dokumente nacheinander hochladen lassen.
  const [formKey, setFormKey] = useState(0);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selected = formData.get("file");

    if (!(selected instanceof File) || selected.size === 0) {
      setStatus({ tone: "danger", message: "Bitte eine Datei auswählen." });
      return;
    }

    startTransition(async () => {
      try {
        const file = await shrinkImage(selected, MAX_UPLOAD_BYTES);
        if (file.size > MAX_UPLOAD_BYTES) {
          setStatus({
            tone: "danger",
            message: `Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
          });
          return;
        }
        formData.set("file", file);

        const response = await fetch("/api/dokumente", { method: "POST", body: formData });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setStatus({
            tone: "danger",
            message: body?.error ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.",
          });
          return;
        }

        setFormKey((key) => key + 1);
        setStatus({ tone: "success", message: `„${selected.name}“ wurde hochgeladen.` });
        router.refresh();
      } catch {
        setStatus({ tone: "danger", message: "Keine Verbindung zum Server. Bitte erneut versuchen." });
      }
    });
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Datei</span>
        <input
          type="file"
          name="file"
          accept={UPLOAD_ACCEPT}
          required
          className={fileInputClass}
        />
        <span className="block text-xs text-subtle">
          PDF oder Foto (JPEG, PNG, WebP, HEIC, TIFF) bis {formatFileSize(MAX_UPLOAD_BYTES)}. Größere
          Fotos werden automatisch verkleinert.
        </span>
      </label>

      {/* Feldfehler kommen hier nicht einzeln zurück – die Meldung steht unter dem Formular. */}
      <FieldErrorsContext value={{}}>
        <DocumentFields {...props} />
      </FieldErrorsContext>

      {status ? <Alert tone={status.tone} title={status.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          Hochladen
        </Button>
      </div>
    </form>
  );
}
