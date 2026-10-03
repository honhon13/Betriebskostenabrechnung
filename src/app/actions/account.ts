"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { accountOpeningSchema, parseId } from "@/lib/validation";
import { saveAccountOpening } from "@/services/account.service";

/** Stichtag und Anfangssalden des Abrechnungskontos speichern. Felder: `amount:<unitId>`, `note:<unitId>`. */
export async function saveAccountOpeningAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const unitIds = [...formData.keys()]
      .filter((name) => name.startsWith("amount:"))
      .map((name) => parseId(name.slice("amount:".length)));

    const input = accountOpeningSchema(unitIds).parse(formToObject(formData)) as Record<string, unknown>;
    await saveAccountOpening(actor, {
      startDate: input.startDate as string,
      balances: unitIds.map((unitId) => ({
        unitId,
        amountCents: input[`amount:${unitId}`] as number,
        note: (input[`note:${unitId}`] as string | null) ?? null,
      })),
    });
    revalidatePath("/", "layout");
  });
}
