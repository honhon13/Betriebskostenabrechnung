import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/auth/current-user";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Nur für die Anzeige in der Sidebar. Geschützt wird jede Seite und jeder
  // Service selbst – ein Layout wird bei Navigation nicht neu ausgeführt.
  const user = await requireUser();

  return (
    <AppShell
      user={{ displayName: user.displayName, roleName: user.roleName, unitName: user.unitName }}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
