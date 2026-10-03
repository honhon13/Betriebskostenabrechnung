import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/auth/current-user";
import { can, canAny } from "@/auth/rbac";
import { AppShell } from "@/components/layout/app-shell";
import { countPendingReviews } from "@/services/review.service";

// „Hinzufügen“ steht auf jeder Seite: Wird dabei ein Beleg angehängt, wartet die Server Action
// auf die OCR-Auswertung bei Azure – dafür reicht das Standard-Zeitlimit nicht immer.
export const maxDuration = 60;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Nur für die Anzeige in der Sidebar. Geschützt wird jede Seite und jeder
  // Service selbst – ein Layout wird bei Navigation nicht neu ausgeführt.
  const user = await requireUser();
  const reviews = can(user, "review:manage");

  return (
    <AppShell
      user={{ displayName: user.displayName, roleName: user.roleName, unitName: user.unitName }}
      review={reviews ? { pending: await countPendingReviews(user) } : null}
      // Wer selbst prüft, legt direkt an – „Meine Eingaben“ ist für alle anderen mit Einreich-Recht.
      submissions={
        !reviews &&
        canAny(user, ["period:submit", "cost:submit", "payment:submit", "document:submit"])
      }
      // Vorlagen sind nur für jene nützlich, die daraus Kosten anlegen oder einreichen können.
      recurring={can(user, "recurring:read") && canAny(user, ["cost:write", "cost:submit"])}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
