import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { Tabs, type TabItem } from "@/components/layout/tabs";
import { PageHeader } from "@/components/ui/page";

export default async function SettingsLayout({ children }: LayoutProps<"/einstellungen">) {
  const user = await requireUser();

  const tabs: TabItem[] = [
    { href: "/einstellungen", label: "Mein Konto" },
    ...(can(user, "masterdata:write")
      ? [{ href: "/einstellungen/stammdaten", label: "Stammdaten" }]
      : []),
    ...(can(user, "user:manage")
      ? [{ href: "/einstellungen/benutzer", label: "Benutzer & Rollen" }]
      : []),
    ...(can(user, "audit:read") ? [{ href: "/einstellungen/protokoll", label: "Audit-Log" }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Einstellungen" />
      {tabs.length > 1 ? <Tabs items={tabs} label="Bereiche der Einstellungen" /> : null}
      {children}
    </div>
  );
}
