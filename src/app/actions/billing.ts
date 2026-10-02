"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireActor } from "@/auth/current-user";
import { authorizeGlobalWrite } from "@/auth/rbac";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { DomainError } from "@/lib/errors";
import { formToObject } from "@/lib/form-data";
import { readUpload } from "@/lib/upload";
import {
  allocationValuesSchema,
  costSchema,
  parseId,
  periodSchema,
  type CostInput,
} from "@/lib/validation";
import {
  resetAllocationValuesFromUnits,
  saveAllocationValues,
} from "@/services/allocation.service";
import { createCost, deleteCost, updateCost } from "@/services/costs.service";
import { checkUpload, uploadDocument, type UploadedFile } from "@/services/documents.service";
import { createPeriod, deletePeriod, setPeriodStatus } from "@/services/periods.service";
import type { SessionUser } from "@/types/auth";

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

/** Hängt den im Kostenformular mitgeschickten Beleg als Rechnung an die Kostenposition. */
async function attachInvoice(
  actor: SessionUser,
  costId: number,
  input: CostInput,
  file: UploadedFile,
): Promise<void> {
  try {
    await uploadDocument(actor, input.periodId, file, {
      type: "invoice",
      description: null,
      unitId: null,
      costIds: [costId],
      paymentId: null,
      documentDate: input.costDate,
      supplier: input.supplier,
      invoiceNumber: input.invoiceNumber,
      servicePeriodStart: null,
      servicePeriodEnd: null,
      netAmount: null,
      taxAmount: null,
      amount: input.amount,
    });
  } catch (error) {
    revalidatePath("/", "layout");
    const reason = error instanceof DomainError ? ` ${error.message}` : "";
    throw new DomainError(
      `Die Kostenposition ist gespeichert, der Beleg konnte aber nicht abgelegt werden.${reason}`,
    );
  }
}

export async function createCostAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = costSchema.parse(formToObject(formData, ["unitIds"]));
    const file = await readUpload(formData);
    if (file) {
      // Erst prüfen, dann anlegen: ein abgelehnter Beleg soll keine halbe Erfassung hinterlassen.
      authorizeGlobalWrite(actor, "document:write");
      await checkUpload(input.periodId, file);
    }

    const costId = await createCost(actor, input);
    if (file) await attachInvoice(actor, costId, input, file);
    revalidatePath("/", "layout");
  });
}

export async function updateCostAction(costId: number, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = parseId(costId);
    const input = costSchema.parse(formToObject(formData, ["unitIds"]));
    const file = await readUpload(formData);
    if (file) {
      authorizeGlobalWrite(actor, "document:write");
      await checkUpload(input.periodId, file);
    }

    await updateCost(actor, id, input);
    if (file) await attachInvoice(actor, id, input, file);
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
