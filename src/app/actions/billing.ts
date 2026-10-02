"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import { allocationValuesSchema, costSchema, parseId, periodSchema } from "@/lib/validation";
import {
  resetAllocationValuesFromUnits,
  saveAllocationValues,
} from "@/services/allocation.service";
import { createCost, deleteCost, updateCost } from "@/services/costs.service";
import { createPeriod, deletePeriod, setPeriodStatus } from "@/services/periods.service";

// Jede Action lädt zuerst den angemeldeten Benutzer; die eigentliche Rechteprüfung
// passiert im Service, damit sie für jeden Aufrufer gilt.

export async function createPeriodAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const period = await createPeriod(actor, periodSchema.parse(formToObject(formData)));
    revalidatePath("/", "layout");
    redirect(`/abrechnung/${period.year}`);
  });
}

export async function setPeriodStatusAction(
  periodId: number,
  status: "draft" | "released",
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await setPeriodStatus(actor, parseId(periodId), status === "released" ? "released" : "draft");
    revalidatePath("/", "layout");
  });
}

export async function deletePeriodAction(periodId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deletePeriod(actor, parseId(periodId));
    revalidatePath("/", "layout");
    redirect("/abrechnung");
  });
}

export async function createCostAction(periodId: number, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await createCost(actor, parseId(periodId), costSchema.parse(formToObject(formData, ["unitIds"])));
    revalidatePath("/", "layout");
  });
}

export async function updateCostAction(costId: number, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await updateCost(actor, parseId(costId), costSchema.parse(formToObject(formData, ["unitIds"])));
    revalidatePath("/", "layout");
  });
}

export async function deleteCostAction(costId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deleteCost(actor, parseId(costId));
    revalidatePath("/", "layout");
  });
}

/** Felder heißen `value:<keyId>:<unitId>` – eine Zelle der Schlüssel-Matrix. */
export async function saveAllocationValuesAction(
  periodId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const values = [...formData.entries()]
      .filter(([name]) => name.startsWith("value:"))
      .map(([name, value]) => {
        const [, keyId, unitId] = name.split(":");
        return { keyId, unitId, value };
      });
    const input = allocationValuesSchema.parse({ values });
    await saveAllocationValues(actor, parseId(periodId), input.values);
    revalidatePath("/", "layout");
    return "Umlageschlüssel gespeichert.";
  });
}

export async function resetAllocationValuesAction(periodId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await resetAllocationValuesFromUnits(actor, parseId(periodId));
    revalidatePath("/", "layout");
  });
}
