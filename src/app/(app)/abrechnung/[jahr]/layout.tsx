import { CircleCheck, ListOrdered, Trash2, Undo2 } from "lucide-react";
import { notFound } from "next/navigation";

import { deletePeriodAction, setPeriodStatusAction } from "@/app/actions/billing";
import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { PeriodStatusBadge } from "@/components/billing/period-status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Tabs, type TabItem } from "@/components/layout/tabs";
import { YearSelect } from "@/components/layout/year-select";
import { ReviewFlag } from "@/components/review/review-badge";
import { ButtonLink } from "@/components/ui/button";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page";
import { formatDate, formatDateTime } from "@/lib/format";
import { listPeriods } from "@/services/periods.service";

export default async function BillingYearLayout({
  children,
  params,
}: LayoutProps<"/abrechnung/[jahr]">) {
  const user = await requireUser();
  if (!can(user, "period:read")) return <NoAccess />;

  const { jahr } = await params;
  const periods = await listPeriods(user);
  // Nicht freigegebene Jahre sind für USER schlicht nicht vorhanden.
  const period = periods.find((p) => String(p.year) === jahr);
  if (!period) notFound();

  const scope = getDataScope(user);
  const base = `/abrechnung/${period.year}`;
  const tabs: TabItem[] = [
    { href: base, label: scope.allUnits ? "Übersicht" : "Meine Abrechnung" },
    ...(scope.allUnits && can(user, "cost:read") ? [{ href: `${base}/kosten`, label: "Kosten" }] : []),
    ...(can(user, "cost:read") && can(user, "payment:read")
      ? [{ href: `${base}/monate`, label: "Monate" }]
      : []),
    ...(scope.allUnits ? [{ href: `${base}/schluessel`, label: "Umlageschlüssel" }] : []),
    ...(can(user, "document:read") ? [{ href: `${base}/belege`, label: "Dokumente" }] : []),
  ];

  const released = period.status === "released";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Abrechnung ${period.year}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(period.startDate)} – {formatDate(period.endDate)}
            <PeriodStatusBadge status={period.status} />
            <ReviewFlag status={period.reviewStatus} />
            {released && period.releasedAt ? (
              <span>seit {formatDateTime(period.releasedAt)}</span>
            ) : null}
          </span>
        }
      >
        <ButtonLink href="/abrechnung" variant="ghost">
          <ListOrdered aria-hidden />
          Alle Jahre
        </ButtonLink>
        <YearSelect
          years={periods.map((p) => p.year)}
          value={period.year}
          hrefPattern="/abrechnung/{year}"
        />
        {can(user, "period:release") ? (
          <ConfirmAction
            trigger={
              released ? (
                <>
                  <Undo2 aria-hidden />
                  Freigabe zurücknehmen
                </>
              ) : (
                <>
                  <CircleCheck aria-hidden />
                  Freigeben
                </>
              )
            }
            triggerVariant="secondary"
            triggerSize="md"
            title={released ? "Freigabe zurücknehmen?" : `Abrechnung ${period.year} freigeben?`}
            description={
              released
                ? "Die Abrechnung ist dann für TOP 1 und TOP 3 nicht mehr sichtbar und kann wieder bearbeitet werden."
                : "Nach der Freigabe sehen die TOPs ihren Anteil, ihre Einzahlungen und die zugehörigen Dokumente. Kosten und Umlageschlüssel sind danach gesperrt."
            }
            confirmLabel={released ? "Zurücknehmen" : "Freigeben"}
            action={setPeriodStatusAction.bind(null, period.id, released ? "draft" : "released")}
          />
        ) : null}
        {can(user, "period:delete") ? (
          <ConfirmAction
            trigger={<Trash2 aria-hidden />}
            triggerLabel={`Abrechnungsjahr ${period.year} löschen`}
            title={`Abrechnungsjahr ${period.year} löschen?`}
            description="Das Jahr kann nur gelöscht werden, wenn es keine Kosten, Einzahlungen und Dokumente mehr enthält."
            confirmLabel="Löschen"
            destructive
            action={deletePeriodAction.bind(null, period.id)}
          />
        ) : null}
        <AddButton user={user} area="billing" period={period} />
      </PageHeader>

      <Tabs items={tabs} label="Bereiche der Abrechnung" />

      {children}
    </div>
  );
}
