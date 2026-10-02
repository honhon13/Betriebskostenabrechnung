import type { Metadata } from "next";

import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dokumente"
        description="Rechnungen, Zahlungsnachweise, Verträge und sonstige Unterlagen aller Abrechnungsjahre."
      />
      <DocumentManager
        user={user}
        periods={await listPeriods(user)}
        basePath="/dokumente"
        searchParams={await searchParams}
      />
    </div>
  );
}
