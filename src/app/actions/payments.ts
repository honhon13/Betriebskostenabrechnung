"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { parseId, paymentSchema } from "@/lib/validation";
import { createPayment, deletePayment, updatePayment } from "@/services/payments.service";

export async function createPaymentAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createPayment(actor, paymentSchema.parse(formToObject(formData)));
    revalidatePath("/", "layout");
  });
}

export async function updatePaymentAction(
  paymentId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updatePayment(actor, parseId(paymentId), paymentSchema.parse(formToObject(formData)));
    revalidatePath("/", "layout");
  });
}

export async function deletePaymentAction(paymentId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deletePayment(actor, parseId(paymentId));
    revalidatePath("/", "layout");
  });
}
