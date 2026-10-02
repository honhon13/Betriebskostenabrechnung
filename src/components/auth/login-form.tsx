"use client";

import { loginAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} submitLabel="Anmelden" footerClassName="[&>button]:w-full">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Benutzername" name="username">
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
        />
      </Field>
      <Field label="Passwort" name="password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
    </ActionForm>
  );
}
