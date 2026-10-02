import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/auth/current-user";
import { PasswordForm } from "@/components/auth/password-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Passwort ändern" };

/** Pflichtschritt nach dem ersten Login bzw. nach einem Passwort-Reset. */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/einstellungen");

  return (
    <Card>
      <CardContent>
        <h1 className="text-lg font-semibold">Neues Passwort vergeben</h1>
        <p className="mt-1 mb-5 text-sm text-muted">
          Hallo {user.displayName}, bitte ersetze dein Initialpasswort durch ein eigenes.
        </p>
        <PasswordForm username={user.username} submitLabel="Passwort speichern" />
        <form action={logoutAction} className="mt-4 text-center">
          <button type="submit" className="text-sm text-muted underline-offset-4 hover:underline">
            Abmelden
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
