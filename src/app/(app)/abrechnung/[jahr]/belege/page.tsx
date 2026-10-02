import type { Metadata } from "next";

import { can } from "@/auth/rbac";
import { DocumentManager } from "@/components/documents/document-manager";
import { NoAccess } from "@/components/ui/no-access";
import { loadPeriodPage } from "@/services/page-context";
import { listPeriods } from "@/services/periods.service";

export const metadata: Metadata = { title: "Dokumente" };

// Die OCR-Auswertung wartet auf Azure – dafür reicht das Standard-Zeitlimit nicht immer.
export const maxDuration = 60;

/** Dokumente eines Abrechnungsjahres – dieselbe Verwaltung wie unter /dokumente, mit festem Jahr. */
export default async function PeriodDocumentsPage({
  params,
  searchParams,
}: PageProps<"/abrechnung/[jahr]/belege">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "document:read")) return <NoAccess />;

  return (
    <DocumentManager
      user={user}
      periods={await listPeriods(user)}
      lockedPeriod={period}
      basePath={`/abrechnung/${period.year}/belege`}
      searchParams={await searchParams}
    />
  );
}
