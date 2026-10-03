import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";

import { authorize } from "@/auth/rbac";
import { getDb, type DbExecutor } from "@/db/client";
import { auditLog } from "@/db/schema";
import {
  auditActionsOf,
  type AuditAction,
  type AuditArea,
  type AuditDetails,
  type AuditEntityType,
} from "@/lib/audit";
import type { SessionUser } from "@/types/auth";

/** Wer eine Aktion ausgelöst hat – Benutzername und TOP werden als Momentaufnahme gespeichert. */
export type AuditActor = Pick<SessionUser, "id" | "username" | "unitName">;

export interface AuditEntryInput {
  action: AuditAction;
  /** Betroffener Datensatz. */
  entity?: { type: AuditEntityType; id: number };
  /** Lesbare Bezeichnung des Datensatzes, z. B. „Kehrung · € 214,80 · 2026“. */
  summary: string;
  details?: AuditDetails;
}

const MAX_SUMMARY = 300;

/** Leere Angaben gar nicht erst speichern. */
function compact(details: AuditDetails | undefined): AuditDetails | null {
  if (!details) return null;
  const result: AuditDetails = {
    ...(details.changes && details.changes.length > 0 ? { changes: details.changes } : {}),
    ...(details.values && details.values.length > 0 ? { values: details.values } : {}),
    ...(details.note ? { note: details.note } : {}),
  };
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Hängt einen Eintrag an das Audit-Log an. Mit `executor` läuft das in der Transaktion der
 * protokollierten Änderung – Änderung und Protokoll entstehen dann gemeinsam oder gar nicht.
 *
 * Es gibt bewusst keine Funktion zum Ändern oder Löschen von Einträgen.
 */
export async function recordAudit(
  actor: AuditActor | null,
  entry: AuditEntryInput,
  executor: DbExecutor = getDb(),
): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: actor?.id ?? null,
    actorName: actor?.username ?? null,
    actorUnit: actor?.unitName ?? null,
    action: entry.action,
    entityType: entry.entity?.type ?? null,
    entityId: entry.entity?.id ?? null,
    summary: entry.summary.slice(0, MAX_SUMMARY),
    details: compact(entry.details),
  });
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/**
 * Gespeicherte Zusatzangaben lesen. Einträge sind unveränderlich – auch solche in einer
 * früheren Form (`values` als Objekt statt als Liste) bleiben daher lesbar.
 */
function readDetails(raw: unknown): AuditDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const details = raw as AuditDetails & { values?: unknown };
  const values = Array.isArray(details.values)
    ? details.values
    : details.values && typeof details.values === "object"
      ? Object.entries(details.values).map(([field, value]) => ({ field, value: String(value) }))
      : undefined;
  return { ...details, values };
}

export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilter {
  area?: AuditArea;
  actorId?: number;
  /** Zeitraum als ISO-Datum (YYYY-MM-DD), jeweils einschließlich, in österreichischer Zeit. */
  from?: string;
  to?: string;
  /** Volltext über Datensatz und Benutzername. */
  search?: string;
  /** Seite ab 1. */
  page?: number;
}

export interface AuditEntryDto {
  id: number;
  occurredAt: string;
  actorId: number | null;
  actorName: string | null;
  actorUnit: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  summary: string;
  details: AuditDetails | null;
}

export interface AuditPage {
  entries: AuditEntryDto[];
  total: number;
  page: number;
  pageCount: number;
}

/** Protokolleinträge, neueste zuerst. Nur mit dem Recht `audit:read`. */
export async function listAuditLog(actor: SessionUser, filter: AuditFilter = {}): Promise<AuditPage> {
  authorize(actor, "audit:read");
  const db = getDb();

  const localDate = sql`(${auditLog.occurredAt} AT TIME ZONE 'Europe/Vienna')::date`;
  const search = filter.search?.trim();
  // % und _ sind in LIKE Platzhalter – als normale Zeichen behandeln.
  const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;

  const where = and(
    filter.area ? inArray(auditLog.action, auditActionsOf(filter.area)) : undefined,
    filter.actorId ? eq(auditLog.actorId, filter.actorId) : undefined,
    filter.from ? sql`${localDate} >= ${filter.from}::date` : undefined,
    filter.to ? sql`${localDate} <= ${filter.to}::date` : undefined,
    pattern ? or(ilike(auditLog.summary, pattern), ilike(auditLog.actorName, pattern)) : undefined,
  );

  const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where);
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pageCount);

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);

  return {
    entries: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actorId: row.actorId,
      actorName: row.actorName,
      actorUnit: row.actorUnit,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      details: readDetails(row.details),
    })),
    total,
    page,
    pageCount,
  };
}

/** Alle Benutzer, die im Protokoll vorkommen – auch inzwischen gelöschte – für den Filter. */
export async function listAuditActors(
  actor: SessionUser,
): Promise<{ id: number; name: string }[]> {
  authorize(actor, "audit:read");
  const rows = await getDb()
    .selectDistinct({ id: auditLog.actorId, name: auditLog.actorName })
    .from(auditLog)
    .where(isNotNull(auditLog.actorId))
    .orderBy(asc(auditLog.actorName));

  const seen = new Set<number>();
  return rows.flatMap((row) => {
    if (row.id === null || seen.has(row.id)) return [];
    seen.add(row.id);
    return [{ id: row.id, name: row.name ?? `Benutzer ${row.id}` }];
  });
}
