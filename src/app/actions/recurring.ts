"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { parseId, recurringCostSchema, recurringGenerateSchema } from "@/lib/validation";
import {
  createRecurringCost,
  deleteRecurringCost,
  generateCostsFromTemplate,
  updateRecurringCost,
} from "@/services/recurring.service";

// Die Rechteprüfung liegt im Service – wie bei allen Actions.

export async function createRecurringCostAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createRecurringCost(actor, recurringCostSchema.parse(formToObject(formData, ["unitIds"])));
    revalidatePath("/", "layout");
  });
}

export async function updateRecurringCostAction(
  recurringCostId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateRecurringCost(
      actor,
      parseId(recurringCostId),
      recurringCostSchema.parse(formToObject(formData, ["unitIds"])),
    );
    revalidatePath("/", "layout");
  });
}

export async function deleteRecurringCostAction(recurringCostId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteRecurringCost(actor, parseId(recurringCostId));
    revalidatePath("/", "layout");
  });
}

/** Erzeugt Kostenpositionen aus einer Vorlage – je gewähltem Monat, Quartal bzw. Jahr eine. */
export async function generateRecurringCostsAction(
  recurringCostId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = recurringGenerateSchema.parse(formToObject(formData, ["slots"]));
    await generateCostsFromTemplate(actor, parseId(recurringCostId), input);
    revalidatePath("/", "layout");
  });
}
