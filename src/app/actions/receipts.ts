"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { parseId, receiptMetaSchema } from "@/lib/validation";
import { deleteReceipt, runReceiptOcr, updateReceipt } from "@/services/receipts.service";

// Der Upload selbst läuft über den Route Handler /api/belege (multipart).

export async function updateReceiptAction(
  receiptId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateReceipt(actor, parseId(receiptId), receiptMetaSchema.parse(formToObject(formData)));
    revalidatePath("/", "layout");
  });
}

export async function deleteReceiptAction(receiptId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteReceipt(actor, parseId(receiptId));
    revalidatePath("/", "layout");
  });
}

export async function runReceiptOcrAction(receiptId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await runReceiptOcr(actor, parseId(receiptId));
    revalidatePath("/", "layout");
  });
}
