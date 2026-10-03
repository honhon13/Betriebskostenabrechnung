import type { Metadata } from "next";

import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { AddButton } from "@/components/add/add-button";
import { DocumentManager } from "@/components/documents/document-manager";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page";
import { listPeriods } from "@/services/periods.service";

export const metadata: Metadata = { title: "Dokumente" };

// Die OCR-Auswertung wartet auf Azure – dafür reicht das Standard-Zeitlimit nicht immer.
export const maxDuration = 60;

export default async function DocumentsPage({ searchParams }: PageProps<"/dokumente">) {
  const user = await requireUser();
  if (!can(user, "document:read") || !can(user, "period:read")) return <NoAccess />;

  const [periods, filters] = await Promise.all([listPeriods(user), searchParams]);
  // Das im Filter gewählte Jahr ist auch die Vorauswahl für neue Dokumente.
  const period = periods.find((p) => String(p.year) === filters.jahr);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dokumente"
        description="Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen aller Abrechnungsjahre."
      >
        <AddButton user={user} area="documents" period={period} />
      </PageHeader>
      <DocumentManager user={user} periods={periods} basePath="/dokumente" searchParams={filters} />
    </div>
  );
}
