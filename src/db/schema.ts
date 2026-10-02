import { relations } from "drizzle-orm";
import {
  boolean,
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

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

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
    allocationKeyId: integer("allocation_key_id")
      .notNull()
      .references(() => allocationKeys.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (t) => [index("costs_period_idx").on(t.periodId)],
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
// Belege
// ---------------------------------------------------------------------------

export const ocrStatus = pgEnum("ocr_status", ["none", "pending", "done", "failed"]);

export const receipts = pgTable(
  "receipts",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    costId: integer("cost_id").references(() => costs.id, { onDelete: "set null" }),
    // Die Datei selbst liegt im Storage – hier nur der Verweis darauf.
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    documentDate: date("document_date", { mode: "string" }),
    supplier: text("supplier"),
    invoiceNumber: text("invoice_number"),
    amountCents: integer("amount_cents"),
    notes: text("notes"),
    ocrStatus: ocrStatus("ocr_status").notNull().default("none"),
    ocrResult: jsonb("ocr_result"),
    ocrProcessedAt: timestamp("ocr_processed_at", { withTimezone: true }),
    uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("receipts_period_idx").on(t.periodId),
    index("receipts_cost_idx").on(t.costId),
    uniqueIndex("receipts_storage_key_idx").on(t.storageProvider, t.storageKey),
  ],
);

// ---------------------------------------------------------------------------
// Einzahlungen
// ---------------------------------------------------------------------------

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
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (t) => [index("payments_period_unit_idx").on(t.periodId, t.unitId)],
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
  receipts: many(receipts),
}));

export const costUnitsRelations = relations(costUnits, ({ one }) => ({
  cost: one(costs, { fields: [costUnits.costId], references: [costs.id] }),
  unit: one(units, { fields: [costUnits.unitId], references: [units.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  period: one(billingPeriods, { fields: [receipts.periodId], references: [billingPeriods.id] }),
  cost: one(costs, { fields: [receipts.costId], references: [costs.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  period: one(billingPeriods, { fields: [payments.periodId], references: [billingPeriods.id] }),
  unit: one(units, { fields: [payments.unitId], references: [units.id] }),
}));
