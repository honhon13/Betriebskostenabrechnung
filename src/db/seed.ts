/**
 * Grunddaten: Rollen und Rechte, TOP 1–3, Benutzer, Umlageschlüssel, Kostenarten
 * und das laufende Abrechnungsjahr. Idempotent – bestehende Einträge (insbesondere
 * Passwörter und angepasste Stammdaten) werden nicht überschrieben.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { generatePassword, hashPassword } from "../auth/password";
import { ALL_PERMISSIONS, ROLE_DEFINITIONS, ROLE_KEYS } from "../auth/permissions";
import { seedAllocationValues } from "./allocation-defaults";
import type { Database } from "./client";
import { createPool } from "./connection";
import { getDirectDatabaseUrl, loadEnv } from "./load-env";
import * as schema from "./schema";

const UNITS = [
  { number: 1, name: "TOP 1" },
  { number: 2, name: "TOP 2" },
  { number: 3, name: "TOP 3" },
];

/** TOP 2 ist die Verwaltung (ADMIN), TOP 1 und TOP 3 sind USER. */
const USERS = [
  { username: "top1", displayName: "TOP 1", unitNumber: 1, role: ROLE_KEYS.USER },
  { username: "top2", displayName: "TOP 2", unitNumber: 2, role: ROLE_KEYS.ADMIN },
  { username: "top3", displayName: "TOP 3", unitNumber: 3, role: ROLE_KEYS.USER },
];

const ALLOCATION_KEYS = [
  {
    code: "area",
    name: "Wohnfläche",
    unitLabel: "m²",
    source: "unit_area" as const,
    description: "Verteilung nach Wohnfläche der TOPs.",
  },
  {
    code: "persons",
    name: "Personen",
    unitLabel: "Pers.",
    source: "unit_persons" as const,
    description: "Verteilung nach Anzahl der Bewohner.",
  },
  {
    code: "consumption",
    name: "Verbrauch",
    unitLabel: "Einh.",
    source: "manual" as const,
    description: "Verteilung nach gemessenem Verbrauch, je Abrechnungsjahr zu erfassen.",
  },
  {
    code: "equal",
    name: "Gleiche Teile",
    unitLabel: "",
    source: "equal" as const,
    description: "Jede beteiligte TOP trägt denselben Anteil.",
  },
];

const CATEGORIES: { name: string; key: string }[] = [
  { name: "Wasser / Abwasser", key: "consumption" },
  { name: "Kanalgebühr", key: "area" },
  { name: "Müllabfuhr", key: "persons" },
  { name: "Grundsteuer", key: "area" },
  { name: "Gebäudeversicherung", key: "area" },
  { name: "Rauchfangkehrer", key: "equal" },
  { name: "Allgemeinstrom", key: "equal" },
  { name: "Heizung", key: "consumption" },
  { name: "Hausbetreuung / Reinigung", key: "area" },
  { name: "Winterdienst", key: "area" },
  { name: "Gartenpflege", key: "area" },
  { name: "Wartung / Instandhaltung", key: "area" },
  { name: "Verwaltung", key: "equal" },
  { name: "Sonstiges", key: "area" },
];

async function seedRoles(db: Database) {
  for (const definition of ROLE_DEFINITIONS) {
    const [existing] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.key, definition.key))
      .limit(1);

    const role =
      existing ??
      (
        await db
          .insert(schema.roles)
          .values({
            key: definition.key,
            name: definition.name,
            description: definition.description,
            isSystem: true,
          })
          .returning()
      )[0];

    // ADMIN bekommt immer den vollen Katalog (auch neu hinzugekommene Rechte).
    // Andere Rollen nur beim ersten Anlegen – spätere Anpassungen bleiben erhalten.
    const permissions =
      definition.key === ROLE_KEYS.ADMIN ? ALL_PERMISSIONS : existing ? [] : definition.permissions;
    if (permissions.length > 0) {
      await db
        .insert(schema.rolePermissions)
        .values(permissions.map((permission) => ({ roleId: role.id, permission })))
        .onConflictDoNothing();
    }
  }
}

async function seedMasterData(db: Database) {
  await db.insert(schema.units).values(UNITS).onConflictDoNothing();

  await db
    .insert(schema.allocationKeys)
    .values(ALLOCATION_KEYS.map((key, index) => ({ ...key, isSystem: true, sortOrder: (index + 1) * 10 })))
    .onConflictDoNothing();

  const keys = await db.select().from(schema.allocationKeys);
  const keyId = (code: string) => keys.find((key) => key.code === code)?.id ?? null;

  await db
    .insert(schema.costCategories)
    .values(
      CATEGORIES.map((category, index) => ({
        name: category.name,
        defaultAllocationKeyId: keyId(category.key),
        sortOrder: (index + 1) * 10,
      })),
    )
    .onConflictDoNothing();
}

async function seedUsers(db: Database) {
  const [roles, units] = await Promise.all([
    db.select().from(schema.roles),
    db.select().from(schema.units),
  ]);
  const created: { username: string; password: string; generated: boolean }[] = [];

  for (const user of USERS) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, user.username))
      .limit(1);
    if (existing) continue;

    const fromEnv = process.env[`SEED_PASSWORD_${user.username.toUpperCase()}`];
    const password = fromEnv || generatePassword();

    await db.insert(schema.users).values({
      username: user.username,
      displayName: user.displayName,
      passwordHash: await hashPassword(password),
      roleId: roles.find((role) => role.key === user.role)!.id,
      unitId: units.find((unit) => unit.number === user.unitNumber)!.id,
      mustChangePassword: process.env.SEED_SKIP_PASSWORD_CHANGE !== "true",
    });
    created.push({ username: user.username, password, generated: !fromEnv });
  }
  return created;
}

async function seedCurrentPeriod(db: Database) {
  const [existing] = await db.select({ id: schema.billingPeriods.id }).from(schema.billingPeriods).limit(1);
  if (existing) return null;

  const year = new Date().getFullYear();
  await db.transaction(async (tx) => {
    const [period] = await tx
      .insert(schema.billingPeriods)
      .values({ year, startDate: `${year}-01-01`, endDate: `${year}-12-31` })
      .returning();
    await seedAllocationValues(tx, period.id, { overwrite: false });
  });
  return year;
}

async function main() {
  loadEnv();
  const url = getDirectDatabaseUrl();
  const pool = createPool(url, 2);
  const db = drizzle(pool, { schema });

  try {
    console.log(`Seed auf ${new URL(url).host} …`);
    await seedRoles(db);
    await seedMasterData(db);
    const users = await seedUsers(db);
    const year = await seedCurrentPeriod(db);

    console.log("Rollen, TOP 1–3, Umlageschlüssel und Kostenarten sind vorhanden.");
    if (year) console.log(`Abrechnungsjahr ${year} angelegt (Entwurf).`);

    if (users.length === 0) {
      console.log("Benutzer existieren bereits – Passwörter unverändert.");
    } else {
      console.log("\nNeue Benutzer:");
      for (const user of users) {
        console.log(
          user.generated
            ? `  ${user.username}  Initialpasswort: ${user.password}`
            : `  ${user.username}  Passwort aus SEED_PASSWORD_${user.username.toUpperCase()}`,
        );
      }
      if (users.some((user) => user.generated)) {
        console.log("\nInitialpasswörter werden nur dieses eine Mal angezeigt und");
        console.log("müssen beim ersten Login geändert werden.");
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed fehlgeschlagen:", error);
  process.exit(1);
});
