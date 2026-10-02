import { ShieldAlert } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

/** Für Seiten, die der angemeldete Benutzer mit seiner Rolle nicht sehen darf. */
export function NoAccess() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Kein Zugriff"
      description="Für diesen Bereich fehlt dir die Berechtigung."
    >
      <ButtonLink href="/dashboard" variant="secondary">
        Zum Dashboard
      </ButtonLink>
    </EmptyState>
  );
}
