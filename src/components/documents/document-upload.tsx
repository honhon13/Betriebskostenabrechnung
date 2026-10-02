"use client";

import { ChevronDown, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type SubmitEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import { shrinkImage } from "@/lib/image-resize";

import { FieldErrorsContext } from "../forms/field";
import { ReceiptMetaFields, type CostOption } from "./receipt-meta-fields";

interface ReceiptUploadProps {
  periodId: number;
  costs: CostOption[];
}

type Status = { tone: "success" | "danger"; message: string } | null;

/** Upload-Formular für Belege. Die Datei geht per multipart an /api/belege. */
export function ReceiptUpload({ periodId, costs }: ReceiptUploadProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
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
        formData.set("periodId", String(periodId));

        const response = await fetch("/api/belege", { method: "POST", body: formData });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setStatus({
            tone: "danger",
            message: body?.error ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.",
          });
          return;
        }

        form.reset();
        setStatus({ tone: "success", message: `„${selected.name}“ wurde hochgeladen.` });
        router.refresh();
      } catch {
        setStatus({ tone: "danger", message: "Keine Verbindung zum Server. Bitte erneut versuchen." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Datei</span>
        <input
          type="file"
          name="file"
          accept={UPLOAD_ACCEPT}
          required
          className="block w-full cursor-pointer rounded-lg border border-dashed border-border-strong bg-surface text-sm text-muted file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-surface-muted file:px-4 file:text-sm file:font-medium file:text-foreground hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
        />
        <span className="block text-xs text-subtle">
          PDF oder Foto (JPEG, PNG, WebP, HEIC, TIFF) bis {formatFileSize(MAX_UPLOAD_BYTES)}. Größere
          Fotos werden automatisch verkleinert.
        </span>
      </label>

      <details className="group rounded-lg border border-border">
        <summary className="flex h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          Zuordnung und Metadaten
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-border p-3">
          {/* Feldfehler kommen hier nicht einzeln zurück – die Meldung steht unter dem Formular. */}
          <FieldErrorsContext value={{}}>
            <ReceiptMetaFields costs={costs} />
          </FieldErrorsContext>
        </div>
      </details>

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
