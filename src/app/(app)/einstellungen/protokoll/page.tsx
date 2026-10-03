import { ChevronLeft, ChevronRight, ScrollText, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { AuditDetailsView } from "@/components/audit/audit-details";
import { FilterForm } from "@/components/forms/filter-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/input";
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
import { formatDateTime } from "@/lib/format";
import { listAuditActors, listAuditLog, type AuditEntryDto } from "@/services/audit.service";

export const metadata: Metadata = { title: "Audit-Log" };

const ALL = "alle";
const BASE = "/einstellungen/protokoll";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  const param = (name: string) => {
    const value = params[name];
    return typeof value === "string" && value !== "" ? value : undefined;
  };

  // Unbekannte Werte fallen auf „alle“ zurück.
  const actors = await listAuditActors(user);
  const search = param("q")?.trim() ?? "";
  const areaParam = param("bereich");
  const area = areaParam && isAuditArea(areaParam) ? areaParam : undefined;
  const actor = actors.find((entry) => String(entry.id) === param("benutzer"));
  const from = ISO_DATE.test(param("von") ?? "") ? param("von") : undefined;
  const to = ISO_DATE.test(param("bis") ?? "") ? param("bis") : undefined;

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

      <FilterForm
        action={BASE}
        className="flex flex-wrap items-end gap-2 border-b border-border px-4 pt-4 pb-4 sm:px-5"
      >
        <label className="min-w-48 flex-1">
          <span className="sr-only">Suche</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Datensatz oder Benutzer …"
              className="pl-9"
            />
          </span>
        </label>
        <Select name="bereich" aria-label="Bereich" defaultValue={area ?? ALL} className="w-auto">
          <option value={ALL}>Alle Bereiche</option>
          {(Object.keys(AUDIT_AREAS) as AuditArea[]).map((value) => (
            <option key={value} value={value}>
              {AUDIT_AREAS[value]}
            </option>
          ))}
        </Select>
        <Select
          name="benutzer"
          aria-label="Benutzer"
          defaultValue={actor ? String(actor.id) : ALL}
          className="w-auto"
        >
          <option value={ALL}>Alle Benutzer</option>
          {actors.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </Select>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Von
          <Input type="date" name="von" defaultValue={from ?? ""} className="w-auto" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Bis
          <Input type="date" name="bis" defaultValue={to ?? ""} className="w-auto" />
        </label>
        <Button type="submit" variant="secondary">
          Suchen
        </Button>
        {filtered ? (
          <Link href={BASE} className={buttonClass("ghost", "md")}>
            <X aria-hidden />
            Zurücksetzen
          </Link>
        ) : null}
      </FilterForm>

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
