import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Binärdaten (PostgreSQL bytea) – der Treiber liefert und erwartet einen Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Prüfung von Benutzer-Eingaben
// ---------------------------------------------------------------------------

/**
 * pending = ausstehende Prüfung, approved = freigegeben, rejected = abgelehnt.
 * Nur „approved“ zählt offiziell (Abrechnung, Salden, Sichtbarkeit für andere).
 */
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);

/**
 * Prüfstatus, Prüfdatum, Prüfer und Kommentar – auf jeder Tabelle, in die Benutzer
 * Einträge einreichen können. Einträge der Verwaltung entstehen direkt als „approved“.
 * (reviewed_by verweist auf users.id; ohne Fremdschlüssel, weil users weiter unten steht
 * und ein gelöschter Prüfer die Historie nicht verändern soll.)
 */
const reviewColumns = () => ({
  reviewStatus: reviewStatus("review_status").notNull().default("approved"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
  reviewComment: text("review_comment"),
});

// ---------------------------------------------------------------------------
// Rollen & Rechte
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  /** Stabiler technischer Schlüssel, z. B. ADMIN / USER. */
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Systemrollen werden vom Seed gepflegt und können nicht gelöscht werden. */
  isSystem: boolean("is_system").notNull().default(false),
  createdAt,
});

/** Rechte je Rolle. Der Rechtekatalog selbst liegt im Code (src/auth/permissions.ts). */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

// ---------------------------------------------------------------------------
// Wohneinheiten (TOPs) & Benutzer
// ---------------------------------------------------------------------------

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  /** Laufende TOP-Nummer (1–3). */
  number: integer("number").notNull().unique(),
  name: text("name").notNull(),
  /** Standardwerte für neue Abrechnungsjahre. */
  areaSqm: numeric("area_sqm", { precision: 8, scale: 2 }),
  persons: integer("persons"),
  notes: text("notes"),
  createdAt,
  updatedAt,
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** Immer kleingeschrieben gespeichert. */
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  roleId: integer("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "restrict" }),
  unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 des Session-Tokens – das Token selbst liegt nur im Cookie. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Abrechnung
// ---------------------------------------------------------------------------

export const periodStatus = pgEnum("period_status", ["draft", "released"]);

export const billingPeriods = pgTable("billing_periods", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  /** draft = nur für Verwaltung sichtbar, released = für die TOPs freigegeben. */
  status: periodStatus("status").notNull().default("draft"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releasedBy: integer("released_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  ...reviewColumns(),
  createdAt,
  updatedAt,
});

/**
 * Woher ein Umlageschlüssel seine Werte bezieht:
 * unit_area / unit_persons = Vorbelegung aus den Stammdaten der TOPs,
 * equal = immer gleiche Teile, manual = Eingabe je Abrechnungsjahr (z. B. Verbrauch).
 */
export const allocationSource = pgEnum("allocation_source", [
  "unit_area",
  "unit_persons",
  "equal",
  "manual",
]);

export const allocationKeys = pgTable("allocation_keys", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Einheit der Werte, z. B. m², Personen, m³, kWh. */
  unitLabel: text("unit_label").notNull().default(""),
  source: allocationSource("source").notNull().default("manual"),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt,
});

/** Schlüsselwert je Abrechnungsjahr, Schlüssel und TOP. */
export const allocationValues = pgTable(
  "allocation_values",
  {
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "cascade" }),
    keyId: integer("key_id")
      .notNull()
      .references(() => allocationKeys.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    value: numeric("value", { precision: 14, scale: 3 }).notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.keyId, t.unitId] })],
);

export const costCategories = pgTable("cost_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  defaultAllocationKeyId: integer("default_allocation_key_id").references(
    () => allocationKeys.id,
    { onDelete: "set null" },
  ),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt,
});

/** fixed = fester Betrag je Zeitraum, variable = der Betrag wird beim Erzeugen eingegeben. */
export const recurringAmountType = pgEnum("recurring_amount_type", ["fixed", "variable"]);

export const recurringInterval = pgEnum("recurring_interval", ["monthly", "quarterly", "yearly"]);

/**
 * Vorlage für wiederkehrende Kosten (z. B. monatliche Hausbetreuung). Aus ihr entstehen
 * gewöhnliche Kostenpositionen – die Vorlage selbst zählt in keiner Abrechnung.
 */
export const recurringCosts = pgTable("recurring_costs", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => costCategories.id, { onDelete: "restrict" }),
  /** Beschreibung der erzeugten Kostenpositionen – der Zeitraum wird angehängt. */
  description: text("description").notNull(),
  amountType: recurringAmountType("amount_type").notNull().default("fixed"),
  /** Betrag je Zeitraum in Cent; bei „variable“ nur ein Richtwert oder leer. */
  amountCents: integer("amount_cents"),
  interval: recurringInterval("interval").notNull(),
  supplier: text("supplier"),
  allocationKeyId: integer("allocation_key_id")
    .notNull()
    .references(() => allocationKeys.id, { onDelete: "restrict" }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
  updatedAt,
});

/** TOP-Zuordnung einer Vorlage – wird in die erzeugten Kostenpositionen übernommen. */
export const recurringCostUnits = pgTable(
  "recurring_cost_units",
  {
    recurringCostId: integer("recurring_cost_id")
      .notNull()
      .references(() => recurringCosts.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.recurringCostId, t.unitId] })],
);

export const costs = pgTable(
  "costs",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => costCategories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    /** Beträge immer in Cent, negative Werte = Gutschrift. */
    amountCents: integer("amount_cents").notNull(),
    costDate: date("cost_date", { mode: "string" }),
    supplier: text("supplier"),
    invoiceNumber: text("invoice_number"),
    /** Leistungszeitraum laut Rechnung. */
    servicePeriodStart: date("service_period_start", { mode: "string" }),
    servicePeriodEnd: date("service_period_end", { mode: "string" }),
    /** Netto und MwSt. laut Rechnung – `amountCents` ist der Bruttobetrag, der verteilt wird. */
    netAmountCents: integer("net_amount_cents"),
    taxAmountCents: integer("tax_amount_cents"),
    allocationKeyId: integer("allocation_key_id")
      .notNull()
      .references(() => allocationKeys.id, { onDelete: "restrict" }),
    notes: text("notes"),
    /**
     * Vorlage, aus der die Position erzeugt wurde. Nur ein Herkunftsvermerk: die Position
     * bleibt unabhängig, und wird die Vorlage gelöscht, bleibt sie bestehen.
     */
    recurringCostId: integer("recurring_cost_id").references(() => recurringCosts.id, {
      onDelete: "set null",
    }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    ...reviewColumns(),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("costs_period_idx").on(t.periodId),
    index("costs_recurring_idx").on(t.recurringCostId),
  ],
);

/** TOP-Zuordnung: auf welche Einheiten eine Kostenposition umgelegt wird. */
export const costUnits = pgTable(
  "cost_units",
  {
    costId: integer("cost_id")
      .notNull()
      .references(() => costs.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.costId, t.unitId] })],
);

// ---------------------------------------------------------------------------
// Einzahlungen
// ---------------------------------------------------------------------------

/**
 * received = eingegangen (zählt in der Abrechnung), pending = erwartet/offen,
 * cancelled = storniert bzw. zurückgebucht. Nur „received“ mindert den offenen Betrag.
 */
export const paymentStatus = pgEnum("payment_status", ["received", "pending", "cancelled"]);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    /** Beträge immer in Cent, negative Werte = Rückzahlung. */
    amountCents: integer("amount_cents").notNull(),
    purpose: text("purpose"),
    note: text("note"),
    status: paymentStatus("status").notNull().default("received"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    ...reviewColumns(),
    createdAt,
    updatedAt,
  },
  (t) => [index("payments_period_unit_idx").on(t.periodId, t.unitId)],
);

// ---------------------------------------------------------------------------
// Dokumente
// ---------------------------------------------------------------------------

export const documentType = pgEnum("document_type", [
  "invoice",
  "payment_proof",
  "contract",
  "other",
]);

export const ocrStatus = pgEnum("ocr_status", ["none", "pending", "done", "failed"]);

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    type: documentType("type").notNull().default("invoice"),
    description: text("description"),
    /** Optional: Dokument gehört zu genau einer TOP (z. B. ein Mietvertrag). */
    unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
    // Nur Metadaten – der Dateiinhalt liegt in document_files.
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    documentDate: date("document_date", { mode: "string" }),
    supplier: text("supplier"),
    invoiceNumber: text("invoice_number"),
    /** Leistungszeitraum laut Rechnung. */
    servicePeriodStart: date("service_period_start", { mode: "string" }),
    servicePeriodEnd: date("service_period_end", { mode: "string" }),
    netAmountCents: integer("net_amount_cents"),
    taxAmountCents: integer("tax_amount_cents"),
    /** Bruttobetrag. */
    amountCents: integer("amount_cents"),
    // none/pending = offen, done = verarbeitet, failed = Fehler (Grund in ocr_error).
    ocrStatus: ocrStatus("ocr_status").notNull().default("none"),
    /** Vollständiges OCR-Ergebnis: erkannte Werte, Anbieter, Modell und Rohfelder. */
    ocrResult: jsonb("ocr_result"),
    ocrError: text("ocr_error"),
    ocrProcessedAt: timestamp("ocr_processed_at", { withTimezone: true }),
    uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...reviewColumns(),
    /** Upload-Datum. */
    createdAt,
    updatedAt,
  },
  (t) => [
    index("documents_period_idx").on(t.periodId),
    index("documents_unit_idx").on(t.unitId),
  ],
);

/**
 * Dateiinhalt eines Dokuments. Bewusst eine eigene Tabelle: Listen und Auswertungen
 * lesen nur `documents` und ziehen so nie die Dateien mit; geladen wird der Inhalt
 * ausschließlich für Vorschau, Download und OCR.
 */
export const documentFiles = pgTable("document_files", {
  documentId: integer("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: bytea("content").notNull(),
});

/**
 * Verknüpfung eines Dokuments mit einer Kostenposition oder einer Einzahlung.
 * Ein Dokument kann mehrere Verknüpfungen haben (z. B. eine Vorschreibung, die
 * auf mehrere Kostenpositionen aufgeteilt wurde).
 */
export const documentLinks = pgTable(
  "document_links",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    costId: integer("cost_id").references(() => costs.id, { onDelete: "cascade" }),
    paymentId: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("document_links_document_cost_idx").on(t.documentId, t.costId),
    uniqueIndex("document_links_document_payment_idx").on(t.documentId, t.paymentId),
    index("document_links_cost_idx").on(t.costId),
    index("document_links_payment_idx").on(t.paymentId),
    // Genau ein Ziel je Verknüpfung.
    check("document_links_one_target", sql`num_nonnulls(${t.costId}, ${t.paymentId}) = 1`),
  ],
);

// ---------------------------------------------------------------------------
// Audit-Log
// ---------------------------------------------------------------------------

/**
 * Protokoll aller relevanten Aktionen. Es wird nur angehängt: die Anwendung kennt keine
 * Funktion zum Ändern oder Löschen, und ein Trigger (Migration 0007) weist UPDATE, DELETE
 * und TRUNCATE auch auf Datenbankebene ab.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * users.id – bewusst ohne Fremdschlüssel: das Löschen eines Benutzers darf das Protokoll
     * nicht verändern. Benutzername und TOP stehen deshalb als Momentaufnahme daneben.
     */
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    actorUnit: text("actor_unit"),
    /** Schlüssel aus AUDIT_ACTIONS (src/lib/audit.ts), z. B. „cost.updated“. */
    action: text("action").notNull(),
    /** Betroffener Datensatz – die ID bleibt stehen, auch wenn er später gelöscht wird. */
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    /** Lesbare Bezeichnung des Datensatzes zum Zeitpunkt der Aktion. */
    summary: text("summary").notNull(),
    /** Optional: vorherige/neue Werte, übernommene Werte oder ein Hinweis (AuditDetails). */
    details: jsonb("details"),
  },
  (t) => [
    index("audit_log_occurred_idx").on(t.occurredAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Relationen
// ---------------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(users),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  unit: one(units, { fields: [users.unitId], references: [units.id] }),
}));

export const costsRelations = relations(costs, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [costs.periodId], references: [billingPeriods.id] }),
  category: one(costCategories, { fields: [costs.categoryId], references: [costCategories.id] }),
  allocationKey: one(allocationKeys, {
    fields: [costs.allocationKeyId],
    references: [allocationKeys.id],
  }),
  units: many(costUnits),
  documentLinks: many(documentLinks),
}));

export const costUnitsRelations = relations(costUnits, ({ one }) => ({
  cost: one(costs, { fields: [costUnits.costId], references: [costs.id] }),
  unit: one(units, { fields: [costUnits.unitId], references: [units.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  period: one(billingPeriods, { fields: [payments.periodId], references: [billingPeriods.id] }),
  unit: one(units, { fields: [payments.unitId], references: [units.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [documents.periodId], references: [billingPeriods.id] }),
  unit: one(units, { fields: [documents.unitId], references: [units.id] }),
  links: many(documentLinks),
}));

export const documentLinksRelations = relations(documentLinks, ({ one }) => ({
  document: one(documents, { fields: [documentLinks.documentId], references: [documents.id] }),
  cost: one(costs, { fields: [documentLinks.costId], references: [costs.id] }),
  payment: one(payments, { fields: [documentLinks.paymentId], references: [payments.id] }),
}));
