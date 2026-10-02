import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { apiErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { formToObject } from "@/lib/form-data";
import { formatFileSize } from "@/lib/format";
import { readUpload } from "@/lib/upload";
import { documentMetaSchema, parseId } from "@/lib/validation";
import { uploadDocument } from "@/services/documents.service";

/** Dokument-Upload (multipart/form-data): Datei, Abrechnungsjahr, Typ und Verknüpfungen. */
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
    const id = await uploadDocument(actor, parseId(formData.get("periodId")), file, meta);

    revalidatePath("/", "layout");
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
