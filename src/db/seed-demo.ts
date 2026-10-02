/**
 * Beispieldaten für Entwicklung und Tests: Wohnflächen, eine freigegebene
 * Abrechnung für das Vorjahr und eine offene für das laufende Jahr.
 * Nicht für die Produktionsdatenbank gedacht – bricht ab, sobald bereits Kosten existieren.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { seedAllocationValues } from "./allocation-defaults";
import type { Database } from "./client";
import { createPool } from "./connection";
import { getDirectDatabaseUrl, loadEnv } from "./load-env";
import * as schema from "./schema";

const UNIT_DATA: Record<number, { areaSqm: string; persons: number; consumption: string; akonto: number }> = {
  1: { areaSqm: "78.50", persons: 2, consumption: "95", akonto: 150_00 },
  2: { areaSqm: "104.20", persons: 4, consumption: "168", akonto: 190_00 },
  3: { areaSqm: "56.30", persons: 1, consumption: "41", akonto: 110_00 },
};

interface DemoCost {
  category: string;
  description: string;
  amountCents: number;
  date: string; // MM-DD
  supplier: string;
  key: string;
  /** Leer = alle TOPs. */
  onlyUnits?: number[];
}

const COSTS_PREVIOUS_YEAR: DemoCost[] = [
  { category: "Wasser / Abwasser", description: "Wasser- und Abwassergebühr", amountCents: 1284_60, date: "12-15", supplier: "Stadtwerke", key: "consumption" },
  { category: "Kanalgebühr", description: "Kanalbenützungsgebühr", amountCents: 438_90, date: "03-31", supplier: "Gemeinde", key: "area" },
  { category: "Müllabfuhr", description: "Müllgebühr Jahresvorschreibung", amountCents: 612_00, date: "02-28", supplier: "Gemeinde", key: "persons" },
  { category: "Grundsteuer", description: "Grundsteuer", amountCents: 386_45, date: "05-15", supplier: "Gemeinde", key: "area" },
  { category: "Gebäudeversicherung", description: "Gebäudeversicherung Jahresprämie", amountCents: 1742_30, date: "01-10", supplier: "Versicherung", key: "area" },
  { category: "Rauchfangkehrer", description: "Kehrung und Überprüfung", amountCents: 214_80, date: "10-08", supplier: "Rauchfangkehrer", key: "equal" },
  { category: "Allgemeinstrom", description: "Strom Stiegenhaus und Keller", amountCents: 356_12, date: "12-20", supplier: "Energieversorger", key: "equal" },
  { category: "Winterdienst", description: "Schneeräumung Saison", amountCents: 420_00, date: "04-02", supplier: "Hausbetreuung", key: "area" },
  { category: "Wartung / Instandhaltung", description: "Thermenwartung TOP 1", amountCents: 189_00, date: "09-18", supplier: "Installateur", key: "equal", onlyUnits: [1] },
];

const COSTS_CURRENT_YEAR: DemoCost[] = [
  { category: "Gebäudeversicherung", description: "Gebäudeversicherung Jahresprämie", amountCents: 1798_40, date: "01-12", supplier: "Versicherung", key: "area" },
  { category: "Müllabfuhr", description: "Müllgebühr Jahresvorschreibung", amountCents: 631_20, date: "02-27", supplier: "Gemeinde", key: "persons" },
  { category: "Kanalgebühr", description: "Kanalbenützungsgebühr", amountCents: 452_10, date: "03-31", supplier: "Gemeinde", key: "area" },
  { category: "Grundsteuer", description: "Grundsteuer", amountCents: 386_45, date: "05-15", supplier: "Gemeinde", key: "area" },
];

async function ensurePeriod(db: Database, year: number) {
  const [existing] = await db
    .select()
    .from(schema.billingPeriods)
    .where(eq(schema.billingPeriods.year, year))
    .limit(1);
  if (existing) return existing;

  const [period] = await db
    .insert(schema.billingPeriods)
    .values({ year, startDate: `${year}-01-01`, endDate: `${year}-12-31` })
    .returning();
  return period;
}

async function main() {
  loadEnv();
  const url = getDirectDatabaseUrl();
  const pool = createPool(url, 2);
  const db = drizzle(pool, { schema });

  try {
    console.log(`Demo-Daten auf ${new URL(url).host} …`);

    const [anyCost] = await db.select({ id: schema.costs.id }).from(schema.costs).limit(1);
    if (anyCost) {
      console.log("Es existieren bereits Kosten – Demo-Daten werden nicht erneut angelegt.");
      return;
    }

    const units = await db.select().from(schema.units);
    const keys = await db.select().from(schema.allocationKeys);
    const categories = await db.select().from(schema.costCategories);
    const [admin] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, "top2"))
      .limit(1);
    if (units.length === 0 || keys.length === 0 || !admin) {
      throw new Error("Bitte zuerst `npm run db:seed` ausführen.");
    }

    const unitByNumber = new Map(units.map((unit) => [unit.number, unit]));
    const keyId = (code: string) => keys.find((key) => key.code === code)!.id;
    const categoryId = (name: string) => categories.find((category) => category.name === name)!.id;

    for (const [number, data] of Object.entries(UNIT_DATA)) {
      await db
        .update(schema.units)
        .set({ areaSqm: data.areaSqm, persons: data.persons })
        .where(eq(schema.units.number, Number(number)));
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const plan = [
      { year: currentYear - 1, costs: COSTS_PREVIOUS_YEAR, months: 12, released: true },
      { year: currentYear, costs: COSTS_CURRENT_YEAR, months: currentMonth, released: false },
    ];

    for (const { year, costs, months, released } of plan) {
      const period = await ensurePeriod(db, year);

      await db.transaction(async (tx) => {
        await seedAllocationValues(tx, period.id, { overwrite: true });

        if (released) {
          for (const [number, data] of Object.entries(UNIT_DATA)) {
            await tx
              .insert(schema.allocationValues)
              .values({
                periodId: period.id,
                keyId: keyId("consumption"),
                unitId: unitByNumber.get(Number(number))!.id,
                value: data.consumption,
              })
              .onConflictDoUpdate({
                target: [
                  schema.allocationValues.periodId,
                  schema.allocationValues.keyId,
                  schema.allocationValues.unitId,
                ],
                set: { value: data.consumption },
              });
          }
        }

        for (const cost of costs) {
          // Kosten des laufenden Jahres nur bis zum heutigen Monat.
          if (!released && Number(cost.date.slice(0, 2)) > currentMonth) continue;

          const [row] = await tx
            .insert(schema.costs)
            .values({
              periodId: period.id,
              categoryId: categoryId(cost.category),
              description: cost.description,
              amountCents: cost.amountCents,
              costDate: `${year}-${cost.date}`,
              supplier: cost.supplier,
              allocationKeyId: keyId(cost.key),
              createdBy: admin.id,
            })
            .returning({ id: schema.costs.id });

          const participants = cost.onlyUnits ?? [...unitByNumber.keys()];
          await tx
            .insert(schema.costUnits)
            .values(participants.map((number) => ({ costId: row.id, unitId: unitByNumber.get(number)!.id })));
        }

        for (let month = 1; month <= months; month++) {
          for (const [number, data] of Object.entries(UNIT_DATA)) {
            const monthText = String(month).padStart(2, "0");
            await tx.insert(schema.payments).values({
              periodId: period.id,
              unitId: unitByNumber.get(Number(number))!.id,
              paymentDate: `${year}-${monthText}-05`,
              amountCents: data.akonto,
              purpose: `Betriebskosten-Akonto ${monthText}/${year}`,
              createdBy: admin.id,
            });
          }
        }

        if (released) {
          await tx
            .update(schema.billingPeriods)
            .set({ status: "released", releasedAt: new Date(), releasedBy: admin.id })
            .where(eq(schema.billingPeriods.id, period.id));
        }
      });

      console.log(`Abrechnungsjahr ${year}: Kosten und Einzahlungen angelegt${released ? " (freigegeben)" : ""}.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Demo-Seed fehlgeschlagen:", error);
  process.exit(1);
});
