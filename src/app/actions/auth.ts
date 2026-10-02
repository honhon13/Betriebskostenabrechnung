"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/current-user";
import { UnauthenticatedError } from "@/auth/errors";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { formToObject, safeRedirectPath } from "@/lib/form-data";
import { changePasswordSchema, loginSchema } from "@/lib/validation";
import { changeOwnPassword, login, logout } from "@/services/auth.service";

export async function loginAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = loginSchema.parse(formToObject(formData));
    await login(input.username, input.password);
    redirect(safeRedirectPath(formData.get("next"), "/dashboard"));
  });
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    // Bewusst getCurrentUser statt requireActor: auch Benutzer, die ihr Passwort
    // erst noch ändern müssen, dürfen genau das tun.
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();

    const input = changePasswordSchema.parse(formToObject(formData));
    await changeOwnPassword(user, input.currentPassword, input.newPassword);

    if (user.mustChangePassword) redirect("/dashboard");
    return "Passwort geändert. Andere Geräte wurden abgemeldet.";
  });
}
