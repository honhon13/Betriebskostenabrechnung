"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { documentMetaSchema, parseId } from "@/lib/validation";
import { deleteDocument, runDocumentOcr, updateDocument } from "@/services/documents.service";

// Der Upload selbst läuft über den Route Handler /api/dokumente (multipart).

export async function updateDocumentAction(
  documentId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const meta = documentMetaSchema.parse(formToObject(formData, ["costIds"]));
    await updateDocument(actor, parseId(documentId), parseId(formData.get("periodId")), meta);
    revalidatePath("/", "layout");
  });
}

export async function deleteDocumentAction(documentId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteDocument(actor, parseId(documentId));
    revalidatePath("/", "layout");
  });
}

export async function runDocumentOcrAction(documentId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await runDocumentOcr(actor, parseId(documentId));
    revalidatePath("/", "layout");
  });
}
