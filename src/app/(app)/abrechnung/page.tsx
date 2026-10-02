import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { NewPeriodDialog } from "@/components/billing/new-period-dialog";
import { Card } from "@/components/ui/card";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { listPeriods, pickDefaultPeriod } from "@/services/periods.service";

export const metadata: Metadata = { title: "Abrechnung" };

/** Einstieg: springt direkt in das laufende bzw. jüngste sichtbare Abrechnungsjahr. */
export default async function BillingIndexPage() {
  const user = await requireUser();
  if (!can(user, "period:read")) return <NoAccess />;

  const period = pickDefaultPeriod(await listPeriods(user));
  if (period) redirect(`/abrechnung/${period.year}`);

  const canCreate = can(user, "period:write");

  return (
    <div className="space-y-6">
      <PageHeader title="Abrechnung" />
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title={canCreate ? "Noch kein Abrechnungsjahr" : "Noch keine freigegebene Abrechnung"}
          description={
            canCreate
              ? "Lege das erste Abrechnungsjahr an, um Kosten, Umlageschlüssel und Belege zu erfassen."
              : "Sobald die Verwaltung eine Abrechnung freigibt, erscheint sie hier."
          }
        >
          {canCreate ? (
            <NewPeriodDialog suggestedYear={new Date().getFullYear()} variant="primary" />
          ) : null}
        </EmptyState>
      </Card>
    </div>
  );
}
