/**
 * Katalog des Audit-Logs: welche Aktionen protokolliert werden und wie sie heißen.
 * Eine weitere Aktion ist eine Zeile hier plus der Aufruf von `recordAudit` im jeweiligen
 * Service – Protokollseite und Filter kennen sie dann von selbst.
 */

/** Bereiche des Protokolls – zugleich die Filter der Protokollseite. */
export const AUDIT_AREAS = {
  auth: "Anmeldung",
  period: "Abrechnung",
  cost: "Kosten",
  payment: "Einzahlungen",
  document: "Dokumente",
  review: "Prüfung",
  recurring: "Wiederkehrende Kosten",
  user: "Benutzer & Rollen",
  masterdata: "Stammdaten",
} as const;

export type AuditArea = keyof typeof AUDIT_AREAS;

export const AUDIT_ACTIONS = {
  "auth.login": { area: "auth", label: "Anmeldung" },
  "auth.login_failed": { area: "auth", label: "Anmeldung fehlgeschlagen" },
  "auth.logout": { area: "auth", label: "Abmeldung" },
  "auth.password_changed": { area: "auth", label: "Passwort geändert" },

  "period.created": { area: "period", label: "Abrechnungsjahr angelegt" },
  "period.submitted": { area: "period", label: "Abrechnungsjahr eingereicht" },
  "period.released": { area: "period", label: "Abrechnung freigegeben" },
  "period.reopened": { area: "period", label: "Freigabe zurückgenommen" },
  "period.deleted": { area: "period", label: "Abrechnungsjahr gelöscht" },
  "allocation.updated": { area: "period", label: "Umlageschlüssel-Werte geändert" },
  "allocation.reset": { area: "period", label: "Umlageschlüssel aus Stammdaten übernommen" },

  "cost.created": { area: "cost", label: "Kostenposition angelegt" },
  "cost.submitted": { area: "cost", label: "Kosten eingereicht" },
  "cost.updated": { area: "cost", label: "Kostenposition geändert" },
  "cost.deleted": { area: "cost", label: "Kostenposition gelöscht" },

  "payment.created": { area: "payment", label: "Einzahlung angelegt" },
  "payment.submitted": { area: "payment", label: "Einzahlung eingereicht" },
  "payment.updated": { area: "payment", label: "Einzahlung geändert" },
  "payment.deleted": { area: "payment", label: "Einzahlung gelöscht" },

  "document.uploaded": { area: "document", label: "Dokument hochgeladen" },
  "document.submitted": { area: "document", label: "Dokument eingereicht" },
  "document.updated": { area: "document", label: "Dokument geändert" },
  "document.deleted": { area: "document", label: "Dokument gelöscht" },
  "document.ocr": { area: "document", label: "Dokument per OCR ausgelesen" },

  "review.approved": { area: "review", label: "Eintrag freigegeben" },
  "review.rejected": { area: "review", label: "Eintrag abgelehnt" },

  "recurring.created": { area: "recurring", label: "Vorlage angelegt" },
  "recurring.updated": { area: "recurring", label: "Vorlage geändert" },
  "recurring.deleted": { area: "recurring", label: "Vorlage gelöscht" },

  "user.created": { area: "user", label: "Benutzer angelegt" },
  "user.updated": { area: "user", label: "Benutzer geändert" },
  "user.deleted": { area: "user", label: "Benutzer gelöscht" },
  "user.password_reset": { area: "user", label: "Passwort zurückgesetzt" },
  "role.created": { area: "user", label: "Rolle angelegt" },
  "role.deleted": { area: "user", label: "Rolle gelöscht" },
  "role.permissions_updated": { area: "user", label: "Rechte einer Rolle geändert" },

  "unit.updated": { area: "masterdata", label: "TOP geändert" },
  "category.created": { area: "masterdata", label: "Kostenart angelegt" },
  "category.updated": { area: "masterdata", label: "Kostenart geändert" },
  "category.deleted": { area: "masterdata", label: "Kostenart gelöscht" },
  "allocation_key.created": { area: "masterdata", label: "Umlageschlüssel angelegt" },
  "allocation_key.updated": { area: "masterdata", label: "Umlageschlüssel geändert" },
  "allocation_key.deleted": { area: "masterdata", label: "Umlageschlüssel gelöscht" },
} as const satisfies Record<string, { area: AuditArea; label: string }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Art des betroffenen Datensatzes. */
export type AuditEntityType =
  | "user"
  | "role"
  | "period"
  | "cost"
  | "payment"
  | "document"
  | "recurring_cost"
  | "unit"
  | "category"
  | "allocation_key";

/** Anzeigewerte eines Datensatzes, nach Feldbeschriftung. Leere Felder sind null. */
export type AuditSnapshot = Record<string, string | null>;

export interface AuditChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface AuditValue {
  field: string;
  value: string;
}

/** Was zu einer Aktion zusätzlich festgehalten wird – alles optional. */
export interface AuditDetails {
  /** Geänderte Felder mit vorherigem und neuem Wert. */
  changes?: AuditChange[];
  /**
   * Werte eines angelegten oder gelöschten Datensatzes. Als Liste, weil jsonb die Reihenfolge
   * der Schlüssel eines Objekts nicht bewahrt – die Felder sollen in fachlicher Reihenfolge stehen.
   */
  values?: AuditValue[];
  /** Freitext, z. B. der Kommentar einer Ablehnung. */
  note?: string;
}

/** Schlüssel aller Aktionen eines Bereichs – für den Filter der Protokollseite. */
export function auditActionsOf(area: AuditArea): AuditAction[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter(
    (action) => AUDIT_ACTIONS[action].area === area,
  );
}

export function isAuditArea(value: string): value is AuditArea {
  return value in AUDIT_AREAS;
}

/** Beschriftung einer Aktion; unbekannte Schlüssel (aus einer anderen Version) bleiben lesbar. */
export function auditActionLabel(action: string): string {
  return action in AUDIT_ACTIONS ? AUDIT_ACTIONS[action as AuditAction].label : action;
}

/** Felder, deren Anzeigewert sich geändert hat – in der Reihenfolge von `after`. */
export function diffSnapshots(before: AuditSnapshot, after: AuditSnapshot): AuditChange[] {
  const fields = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  return fields
    .map((field) => ({ field, from: before[field] ?? null, to: after[field] ?? null }))
    .filter((change) => change.from !== change.to);
}

/** Ausgefüllte Felder eines Datensatzes – für „angelegt“ und „gelöscht“. */
export function snapshotValues(snapshot: AuditSnapshot): AuditValue[] {
  return Object.entries(snapshot).flatMap(([field, value]) =>
    value === null ? [] : [{ field, value }],
  );
}
