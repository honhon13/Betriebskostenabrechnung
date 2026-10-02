import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { apiErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { formToObject } from "@/lib/form-data";
import { formatFileSize } from "@/lib/format";
import { parseId, receiptMetaSchema } from "@/lib/validation";
import { uploadReceipt } from "@/services/receipts.service";

/** Beleg-Upload (multipart/form-data): Datei, Abrechnungsjahr und optionale Metadaten. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor();

    // Zu große Uploads ablehnen, bevor der Body in den Speicher gelesen wird.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new DomainError(`Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new DomainError("Bitte eine Datei auswählen.");

    const meta = receiptMetaSchema.parse(formToObject(formData));
    const id = await uploadReceipt(
      actor,
      parseId(formData.get("periodId")),
      { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
      meta,
    );

    revalidatePath("/", "layout");
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
