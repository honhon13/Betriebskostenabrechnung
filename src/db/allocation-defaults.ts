import type { DbExecutor } from "./client";
import { allocationKeys, allocationValues, units } from "./schema";

/** Belegt die Schlüsselwerte eines Jahres aus den Stammdaten der TOPs vor. */
export async function seedAllocationValues(
  tx: DbExecutor,
  periodId: number,
  options: { overwrite: boolean },
): Promise<void> {
  // Nacheinander: innerhalb einer Transaktion teilen sich alle Abfragen eine Verbindung.
  const keyRows = await tx.select().from(allocationKeys);
  const unitRows = await tx.select().from(units);

  const rows = keyRows
    .filter((key) => key.source !== "equal")
    .flatMap((key) =>
      unitRows.map((unit) => ({
        // Verbrauchswerte (manual) werden nie überschrieben – nur Stammdaten-Schlüssel.
        fromMasterData: key.source !== "manual",
        values: {
          periodId,
          keyId: key.id,
          unitId: unit.id,
          value:
            key.source === "unit_area"
              ? (unit.areaSqm ?? "0")
              : key.source === "unit_persons"
                ? String(unit.persons ?? 0)
                : "0",
        },
      })),
    );

  for (const { fromMasterData, values } of rows) {
    const insert = tx.insert(allocationValues).values(values);
    await (options.overwrite && fromMasterData
      ? insert.onConflictDoUpdate({
          target: [allocationValues.periodId, allocationValues.keyId, allocationValues.unitId],
          set: { value: values.value },
        })
      : insert.onConflictDoNothing());
  }
}
