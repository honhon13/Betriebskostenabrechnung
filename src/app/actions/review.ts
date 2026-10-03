"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { parseId, reviewDecisionSchema, reviewKindSchema } from "@/lib/validation";
import { reviewEntry } from "@/services/review.service";

/** Gibt einen eingereichten Eintrag frei oder lehnt ihn ab – mit optionalem Kommentar. */
export async function reviewAction(
  kind: string,
  id: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const { decision, comment } = reviewDecisionSchema.parse(formToObject(formData));
    await reviewEntry(actor, reviewKindSchema.parse(kind), parseId(id), decision, comment);
    revalidatePath("/", "layout");
  });
}
