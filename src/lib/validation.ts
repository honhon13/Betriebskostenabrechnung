import * as z from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/auth/password-policy";

import { parseEuroToCents } from "./money";

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

const id = z.coerce.number().int().positive().max(2_147_483_647);

/**
 * IDs, die als gebundene Argumente an Server Actions hängen, kommen vom Client
 * und sind damit ungeprüfte Eingaben – auch wenn TypeScript `number` verspricht.
 */
export function parseId(value: unknown): number {
  return id.parse(value);
}

/** 10 Mio. € – weit über jeder realen Position und sicher innerhalb von integer. */
const MAX_AMOUNT_CENTS = 1_000_000_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein gültiges Datum angeben.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Bitte ein gültiges Datum angeben.");

const optionalIsoDate = z
  .union([z.literal(""), isoDate])
  .nullish()
  .transform((value) => value || null);

/** Betrag als Text ("1.234,56") → Cent. */
const amountCents = z
  .string()
  .transform((value, ctx) => {
    const cents = parseEuroToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Bitte einen Betrag wie 1.234,56 angeben." });
      return z.NEVER;
    }
    return cents;
  })
  .refine((cents) => cents !== 0, "Der Betrag darf nicht 0 sein.")
  .refine((cents) => Math.abs(cents) <= MAX_AMOUNT_CENTS, "Der Betrag ist zu groß.");

const optionalAmountCents = z
  .string()
  .nullish()
  .transform((value, ctx) => {
    if (!value || value.trim() === "") return null;
    const cents = parseEuroToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Bitte einen Betrag wie 1.234,56 angeben." });
      return z.NEVER;
    }
    return cents;
  });

const optionalId = z
  .union([z.literal(""), id])
  .nullish()
  .transform((value) => value || null);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .nullish()
  .transform((value) => value === "on" || value === "true");

/** Dezimalzahl mit Komma oder Punkt, höchstens drei Nachkommastellen, nicht negativ. */
const decimal = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d{1,9}(\.\d{1,3})?$/.test(value), "Bitte eine Zahl wie 75,5 angeben.");

const optionalDecimal = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value.replace(",", ".") : null))
  .refine(
    (value) => value === null || /^\d{1,6}(\.\d{1,2})?$/.test(value),
    "Bitte eine Zahl wie 75,5 angeben.",
  );

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`)
  .max(MAX_PASSWORD_LENGTH, `Höchstens ${MAX_PASSWORD_LENGTH} Zeichen.`);

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "3–40 Zeichen: Buchstaben, Ziffern, Punkt, Binde- oder Unterstrich.");

// ---------------------------------------------------------------------------
// Anmeldung & Konto
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Bitte Benutzernamen angeben.").max(100),
  password: z.string().min(1, "Bitte Passwort angeben.").max(MAX_PASSWORD_LENGTH),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bitte aktuelles Passwort angeben."),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Die Passwörter stimmen nicht überein.",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "Das neue Passwort muss sich vom aktuellen unterscheiden.",
  });

// ---------------------------------------------------------------------------
// Abrechnung
// ---------------------------------------------------------------------------

export const periodSchema = z.object({
  year: z.coerce
    .number("Bitte ein Jahr angeben.")
    .int()
    .min(2000, "Bitte ein Jahr ab 2000 angeben.")
    .max(2100, "Bitte ein Jahr bis 2100 angeben."),
  notes: optionalText(1000),
});

export const costSchema = z.object({
  /** Abrechnungsjahr der Kostenposition. */
  periodId: id,
  categoryId: id,
  description: z.string().trim().min(1, "Bitte eine Beschreibung angeben.").max(200),
  amount: amountCents,
  costDate: optionalIsoDate,
  supplier: optionalText(200),
  invoiceNumber: optionalText(100),
  allocationKeyId: id,
  unitIds: z.array(id).min(1, "Bitte mindestens eine TOP auswählen."),
  notes: optionalText(1000),
});

export const allocationValuesSchema = z.object({
  values: z.array(z.object({ keyId: id, unitId: id, value: decimal })),
});

// ---------------------------------------------------------------------------
// Einzahlungen
// ---------------------------------------------------------------------------

export const paymentSchema = z.object({
  periodId: id,
  unitId: id,
  paymentDate: isoDate,
  amount: amountCents,
  purpose: optionalText(200),
  note: optionalText(1000),
  status: z.enum(["received", "pending", "cancelled"]).default("received"),
});

// ---------------------------------------------------------------------------
// Dokumente
// ---------------------------------------------------------------------------

export const documentTypeSchema = z.enum(["invoice", "payment_proof", "contract", "other"]);

export const documentMetaSchema = z.object({
  type: documentTypeSchema.default("invoice"),
  description: optionalText(1000),
  /** Optional: TOP, zu der das Dokument gehört. */
  unitId: optionalId,
  /** Verknüpfte Kostenpositionen (keine, eine oder mehrere). */
  costIds: z.array(id).max(100).default([]),
  /** Verknüpfte Einzahlung, z. B. bei einem Zahlungsnachweis. */
  paymentId: optionalId,
  documentDate: optionalIsoDate,
  supplier: optionalText(200),
  invoiceNumber: optionalText(100),
  amount: optionalAmountCents,
});

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

export const unitSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(60),
  areaSqm: optionalDecimal,
  persons: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(99)])
    .nullish()
    .transform((value) => (value === "" || value === null || value === undefined ? null : value)),
  notes: optionalText(500),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80),
  description: optionalText(300),
  defaultAllocationKeyId: optionalId,
  isActive: checkbox,
});

export const allocationKeySchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80),
  unitLabel: z.string().trim().max(20).default(""),
  description: optionalText(300),
  isActive: checkbox,
});

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

export const userCreateSchema = z.object({
  username,
  displayName: z.string().trim().min(1, "Bitte einen Anzeigenamen angeben.").max(80),
  roleId: id,
  unitId: optionalId,
  password,
});

export const userUpdateSchema = z.object({
  displayName: z.string().trim().min(1, "Bitte einen Anzeigenamen angeben.").max(80),
  roleId: id,
  unitId: optionalId,
  isActive: checkbox,
});

export const rolePermissionsSchema = z.object({
  permissions: z.array(z.string().max(60)),
});

export type CostInput = z.infer<typeof costSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;
export type PeriodInput = z.infer<typeof periodSchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type AllocationKeyInput = z.infer<typeof allocationKeySchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
