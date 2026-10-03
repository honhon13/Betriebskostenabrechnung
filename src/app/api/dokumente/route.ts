import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { apiErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { formToObject } from "@/lib/form-data";
import { formatFileSize } from "@/lib/format";
import { readUpload } from "@/lib/upload";
import { documentMetaSchema, parseId } from "@/lib/validation";
import {
  getDocument,
  isOcrAvailable,
  processDocumentOcr,
  uploadDocument,
} from "@/services/documents.service";
import { submitDocument } from "@/services/submissions.service";
import type { OcrOutcome } from "@/types/billing";

// Die OCR-Auswertung wartet auf Azure – dafür reicht das Standard-Zeitlimit nicht immer.
export const maxDuration = 60;

/**
 * Dokument-Upload (multipart/form-data): Datei, Abrechnungsjahr, Typ und Verknüpfungen.
 * Mit `ocr=on` wird das Dokument direkt nach dem Speichern per OCR ausgelesen; die Antwort
 * enthält dann das Dokument mit den übernommenen Werten und das Ergebnis der Auswertung.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor();

    // Zu große Uploads ablehnen, bevor der Body in den Speicher gelesen wird.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new DomainError(`Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
    }

    const formData = await request.formData();
    const file = await readUpload(formData);
    if (!file) throw new DomainError("Bitte eine Datei auswählen.");

    const meta = documentMetaSchema.parse(formToObject(formData, ["costIds"]));
    const periodId = parseId(formData.get("periodId"));
    // Die Verwaltung legt Dokumente direkt ab; alle anderen reichen sie zur Prüfung ein.
    const direct = can(actor, "document:write") && getDataScope(actor).allUnits;
    const id = direct
      ? await uploadDocument(actor, periodId, file, meta)
      : await submitDocument(actor, periodId, file, meta);

    // Das Original ist ab hier gespeichert. Scheitert die OCR, bleibt der Upload erfolgreich –
    // der Fehler steht am Dokument, und es lässt sich von Hand ergänzen oder erneut auslesen.
    let ocr: OcrOutcome | null = null;
    if (direct && formData.get("ocr") === "on" && isOcrAvailable() && can(actor, "document:ocr")) {
      ocr = await processDocumentOcr(actor, id);
    }

    revalidatePath("/", "layout");
    return Response.json({ id, document: await getDocument(actor, id), ocr }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
