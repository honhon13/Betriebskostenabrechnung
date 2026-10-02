"use client";

import { changePasswordAction } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/auth/password-policy";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";

interface PasswordFormProps {
  /** Benutzername als verstecktes Feld – hilft Passwortmanagern, den Eintrag zuzuordnen. */
  username: string;
  submitLabel?: string;
}

export function PasswordForm({ username, submitLabel = "Passwort ändern" }: PasswordFormProps) {
  return (
    <ActionForm action={changePasswordAction} submitLabel={submitLabel} showSuccess resetOnSuccess>
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <Field label="Aktuelles Passwort" name="currentPassword">
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label="Neues Passwort"
        name="newPassword"
        hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
      >
        <Input name="newPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Neues Passwort wiederholen" name="confirmPassword">
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
    </ActionForm>
  );
}
