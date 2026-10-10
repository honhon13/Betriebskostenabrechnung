import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { AuditDetailsView } from "@/components/audit/audit-details";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterDateRange, FilterSelect } from "@/components/filters/filter-controls";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState } from "@/components/ui/page";
import {
  AUDIT_ACTIONS,
  AUDIT_AREAS,
  auditActionLabel,
  isAuditArea,
  type AuditAction,
  type AuditArea,
} from "@/lib/audit";
import { countActive, readDate, readParam } from "@/lib/filters";
import { formatDateTime } from "@/lib/format";
import { listAuditActors, listAuditLog, type AuditEntryDto } from "@/services/audit.service";

export const metadata: Metadata = { title: "Audit-Log" };

const BASE = "/einstellungen/protokoll";

const areaOf = (action: string): AuditArea | null =>
  action in AUDIT_ACTIONS ? AUDIT_ACTIONS[action as AuditAction].area : null;

/**
 * Audit-Log: wer wann was getan hat. Nur lesbar – Einträge lassen sich weder ändern noch
 * löschen. Die Filter liegen in der URL.
 */
export default async function AuditLogPage({ searchParams }: PageProps<"/einstellungen/protokoll">) {
  const user = await requireUser();
  if (!can(user, "audit:read")) return <NoAccess />;

  const params = await searchParams;
  const param = (name: string) => readParam(params, name);

  // Unbekannte Werte fallen auf „alle“ zurück.
  const actors = await listAuditActors(user);
  const search = param("q") ?? "";
  const areaParam = param("bereich");
  const area = areaParam && isAuditArea(areaParam) ? areaParam : undefined;
  const actor = actors.find((entry) => String(entry.id) === param("benutzer"));
  const from = readDate(params, "von");
  const to = readDate(params, "bis");

  const log = await listAuditLog(user, {
    search,
    area,
    actorId: actor?.id,
    from,
    to,
    page: Number(param("seite")) || 1,
  });
  const filtered = Boolean(search || area || actor || from || to);

  const pageHref = (page: number) => {
    const query = new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(area ? { bereich: area } : {}),
      ...(actor ? { benutzer: String(actor.id) } : {}),
      ...(from ? { von: from } : {}),
      ...(to ? { bis: to } : {}),
      ...(page > 1 ? { seite: String(page) } : {}),
    }).toString();
    return query ? `${BASE}?${query}` : BASE;
  };

  const action = (entry: AuditEntryDto) => {
    const entryArea = areaOf(entry.action);
    return (
      <>
        <span className="font-medium">{auditActionLabel(entry.action)}</span>
        {entryArea ? (
          <span className="mt-0.5 block">
            <Badge>{AUDIT_AREAS[entryArea]}</Badge>
          </span>
        ) : null}
      </>
    );
  };

  const columns: Column<AuditEntryDto>[] = [
    {
      key: "time",
      header: "Zeitpunkt",
      cell: (entry) => formatDateTime(entry.occurredAt),
      className: "whitespace-nowrap",
    },
    {
      key: "actor",
      header: "Benutzer",
      cell: (entry) =>
        entry.actorName ? (
          <>
            {entry.actorName}
            {entry.actorUnit ? <span className="block text-xs text-muted">{entry.actorUnit}</span> : null}
          </>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    { key: "action", header: "Aktion", mobile: false, cell: action },
    {
      key: "record",
      header: "Datensatz",
      cell: (entry) => <span className="wrap-anywhere">{entry.summary}</span>,
      className: "md:min-w-44",
    },
    {
      key: "details",
      header: "Details",
      cell: (entry) => <AuditDetailsView details={entry.details} />,
      className: "md:min-w-56",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Audit-Log"
        description={
          `${log.total} ${log.total === 1 ? "Eintrag" : "Einträge"}${filtered ? " in dieser Auswahl" : ""}. ` +
          "Das Protokoll wird nur fortgeschrieben – Einträge lassen sich weder ändern noch löschen."
        }
      />

      <FilterBar
        action={BASE}
        activeCount={countActive([search, area, actor, from, to])}
        search={{ value: search, placeholder: "Datensatz oder Benutzer …" }}
      >
        <FilterSelect
          name="bereich"
          label="Bereich"
          value={area}
          allLabel="Alle Bereiche"
          options={(Object.keys(AUDIT_AREAS) as AuditArea[]).map((value) => ({
            value,
            label: AUDIT_AREAS[value],
          }))}
        />
        <FilterSelect
          name="benutzer"
          label="Benutzer"
          value={actor?.id}
          allLabel="Alle Benutzer"
          options={actors.map((entry) => ({ value: entry.id, label: entry.name }))}
        />
        <FilterDateRange from={from} to={to} subject="Zeitpunkt" />
      </FilterBar>

      {log.entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? "Keine Treffer" : "Noch keine Einträge"}
          description={
            filtered
              ? "Für diese Suche bzw. Filter gibt es keine Protokolleinträge."
              : "Sobald sich jemand anmeldet oder etwas ändert, steht es hier."
          }
        />
      ) : (
        <div className="pt-1">
          <DataTable
            caption="Audit-Log"
            rows={log.entries}
            columns={columns}
            rowKey={(entry) => entry.id}
            mobileTitle={action}
          />
        </div>
      )}

      {log.pageCount > 1 ? (
        <nav
          aria-label="Seiten des Audit-Logs"
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:px-5"
        >
          {log.page > 1 ? (
            <Link href={pageHref(log.page - 1)} className={buttonClass("secondary", "sm")}>
              <ChevronLeft aria-hidden />
              Neuere
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Seite {log.page} von {log.pageCount}
          </span>
          {log.page < log.pageCount ? (
            <Link href={pageHref(log.page + 1)} className={buttonClass("secondary", "sm")}>
              Ältere
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </Card>
  );
}
