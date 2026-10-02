"use client";

import { KeyRound } from "lucide-react";

import { ConfirmAction } from "@/components/forms/confirm-action";
import type { ActionState } from "@/lib/action-state";

interface ResetPasswordButtonProps {
  username: string;
  action: () => Promise<ActionState>;
}

/** Setzt ein Zufallspasswort und zeigt es genau einmal an. */
export function ResetPasswordButton({ username, action }: ResetPasswordButtonProps) {
  return (
    <ConfirmAction
      trigger={<KeyRound aria-hidden />}
      triggerLabel={`Passwort von ${username} zurücksetzen`}
      title="Passwort zurücksetzen?"
      description={
        <>
          Für <strong>{username}</strong> wird ein neues Zufallspasswort erzeugt. Alle Sitzungen
          werden beendet; beim nächsten Login muss ein eigenes Passwort vergeben werden.
        </>
      }
      confirmLabel="Zurücksetzen"
      action={action}
      renderResult={(password) => (
        <div className="space-y-2 text-sm">
          <p>
            Neues Passwort für <strong>{username}</strong>:
          </p>
          <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-base select-all">
            {password}
          </p>
          <p className="text-muted">
            Bitte jetzt notieren und sicher weitergeben – es wird nicht noch einmal angezeigt.
          </p>
        </div>
      )}
    />
  );
}
