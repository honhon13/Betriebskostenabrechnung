"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireActor } from "@/auth/current-user";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/form-data";
import {
  allocationKeySchema,
  categorySchema,
  parseId,
  rolePermissionsSchema,
  unitSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validation";
import {
  createAllocationKey,
  createCategory,
  deleteAllocationKey,
  deleteCategory,
  updateAllocationKey,
  updateCategory,
  updateUnit,
} from "@/services/masterdata.service";
import {
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  resetUserPassword,
  updateRolePermissions,
  updateUser,
} from "@/services/users.service";

/** Kleine Hülle: Benutzer laden, Service aufrufen, Seiten neu rendern. */
function mutation(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<string | void>) {
  return runAction(async () => {
    const actor = await requireActor();
    const message = await fn(actor);
    revalidatePath("/", "layout");
    return message;
  });
}

// --- Stammdaten ------------------------------------------------------------

export async function updateUnitAction(unitId: number, formData: FormData): Promise<ActionState> {
  return mutation((actor) => updateUnit(actor, parseId(unitId), unitSchema.parse(formToObject(formData))));
}

export async function createCategoryAction(formData: FormData): Promise<ActionState> {
  return mutation((actor) => createCategory(actor, categorySchema.parse(formToObject(formData))));
}

export async function updateCategoryAction(
  categoryId: number,
  formData: FormData,
): Promise<ActionState> {
  return mutation((actor) =>
    updateCategory(actor, parseId(categoryId), categorySchema.parse(formToObject(formData))),
  );
}

export async function deleteCategoryAction(categoryId: number): Promise<ActionState> {
  return mutation((actor) => deleteCategory(actor, parseId(categoryId)));
}

export async function createAllocationKeyAction(formData: FormData): Promise<ActionState> {
  return mutation((actor) =>
    createAllocationKey(actor, allocationKeySchema.parse(formToObject(formData))),
  );
}

export async function updateAllocationKeyAction(
  keyId: number,
  formData: FormData,
): Promise<ActionState> {
  return mutation((actor) =>
    updateAllocationKey(actor, parseId(keyId), allocationKeySchema.parse(formToObject(formData))),
  );
}

export async function deleteAllocationKeyAction(keyId: number): Promise<ActionState> {
  return mutation((actor) => deleteAllocationKey(actor, parseId(keyId)));
}

// --- Benutzer & Rollen -----------------------------------------------------

export async function createUserAction(formData: FormData): Promise<ActionState> {
  return mutation((actor) => createUser(actor, userCreateSchema.parse(formToObject(formData))));
}

export async function updateUserAction(userId: number, formData: FormData): Promise<ActionState> {
  return mutation((actor) =>
    updateUser(actor, parseId(userId), userUpdateSchema.parse(formToObject(formData))),
  );
}

export async function deleteUserAction(userId: number): Promise<ActionState> {
  return mutation((actor) => deleteUser(actor, parseId(userId)));
}

/** Gibt das neue Passwort als `message` zurück – es wird genau einmal angezeigt. */
export async function resetUserPasswordAction(userId: number): Promise<ActionState> {
  return mutation((actor) => resetUserPassword(actor, parseId(userId)));
}

const roleSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(40),
  description: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null),
});

export async function createRoleAction(formData: FormData): Promise<ActionState> {
  return mutation((actor) => createRole(actor, roleSchema.parse(formToObject(formData))));
}

export async function deleteRoleAction(roleId: number): Promise<ActionState> {
  return mutation((actor) => deleteRole(actor, parseId(roleId)));
}

export async function updateRolePermissionsAction(
  roleId: number,
  formData: FormData,
): Promise<ActionState> {
  return mutation(async (actor) => {
    const input = rolePermissionsSchema.parse(formToObject(formData, ["permissions"]));
    await updateRolePermissions(actor, parseId(roleId), input.permissions);
    return "Rechte gespeichert.";
  });
}
