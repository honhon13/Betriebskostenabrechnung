import { describe, expect, it } from "vitest";

import { accountBalanceLabel, buildUnitAccount, summarizeAccounts } from "@/lib/billing/account";
import { accountOpeningSchema } from "@/lib/validation";

const unit = { id: 1, name: "TOP 1" };
const move = (id: number, date: string, amountCents: number) => ({
  id,
  date,
  year: 2026,
  purpose: null,
  amountCents,
});

describe("Abrechnungskonto: laufender Saldo", () => {
  it("Anfangssaldo + Einzahlungen − Auszahlungen = aktueller Saldo", () => {
    const account = buildUnitAccount(unit, { amountCents: 250_00, note: null }, [
      move(1, "2026-01-05", 150_00),
      move(2, "2026-02-05", 150_00),
      move(3, "2026-02-20", -80_00),
    ]);
    expect(account.openingCents).toBe(250_00);
    expect(account.inflowCents).toBe(300_00);
    expect(account.outflowCents).toBe(80_00);
    expect(account.balanceCents).toBe(250_00 + 300_00 - 80_00);
    expect(account.balanceCents).toBe(account.movements.at(-1)!.balanceCents);
  });

  it("führt die Bewegungen chronologisch weiter – unabhängig von der Reihenfolge der Erfassung", () => {
    const account = buildUnitAccount(unit, { amountCents: -100_00, note: "Rückstand 2025" }, [
      move(3, "2026-03-01", 40_00),
      move(1, "2026-01-10", 60_00),
      move(2, "2026-01-10", -10_00),
    ]);
    expect(account.movements.map((m) => [m.id, m.balanceCents])).toEqual([
      [1, -40_00],
      [2, -50_00],
      [3, -10_00],
    ]);
    expect(account.balanceCents).toBe(-10_00);
    expect(account.openingNote).toBe("Rückstand 2025");
  });

  it("ohne Bewegungen ist der Saldo der Anfangssaldo – und der bleibt, was er ist", () => {
    const opening = { amountCents: -320_50, note: null };
    const account = buildUnitAccount(unit, opening, []);
    expect(account.balanceCents).toBe(-320_50);
    expect(account.movements).toEqual([]);

    // Weitere Bewegungen ändern den Saldo, nie den Anfangsbestand.
    const later = buildUnitAccount(unit, opening, [move(1, "2026-01-01", 500_00)]);
    expect(later.openingCents).toBe(-320_50);
    expect(opening.amountCents).toBe(-320_50);
    expect(later.balanceCents).toBe(179_50);
  });

  it("Gesamtbestand = Summe der Salden aller TOPs", () => {
    const accounts = [
      buildUnitAccount(unit, { amountCents: 100_00, note: null }, [move(1, "2026-01-01", 50_00)]),
      buildUnitAccount({ id: 2, name: "TOP 2" }, { amountCents: -30_00, note: null }, [move(2, "2026-01-02", -20_00)]),
      buildUnitAccount({ id: 3, name: "TOP 3" }, { amountCents: 0, note: null }, []),
    ];
    const total = summarizeAccounts(accounts);
    expect(total).toEqual({ openingCents: 70_00, inflowCents: 50_00, outflowCents: 20_00, balanceCents: 100_00 });
    expect(total.balanceCents).toBe(total.openingCents + total.inflowCents - total.outflowCents);
    expect(summarizeAccounts([])).toEqual({ openingCents: 0, inflowCents: 0, outflowCents: 0, balanceCents: 0 });
  });

  it("benennt den Kontostand", () => {
    expect(accountBalanceLabel(1)).toBe("Guthaben");
    expect(accountBalanceLabel(-1)).toBe("Rückstand");
    expect(accountBalanceLabel(0)).toBe("Ausgeglichen");
  });
});

describe("Abrechnungskonto: Eingabe des Anfangsbestands", () => {
  const schema = accountOpeningSchema([1, 2]);

  it("liest Guthaben, Rückstand und leere Felder", () => {
    const input = schema.parse({
      startDate: "2026-01-01",
      "amount:1": "1.250,00",
      "note:1": " Guthaben aus 2025 ",
      "amount:2": "-320,50",
      "note:2": "",
    }) as Record<string, unknown>;
    expect(input["amount:1"]).toBe(1250_00);
    expect(input["note:1"]).toBe("Guthaben aus 2025");
    expect(input["amount:2"]).toBe(-320_50);
    expect(input["note:2"]).toBeNull();
    // Kein Betrag = Anfangssaldo 0.
    expect((schema.parse({ startDate: "2026-01-01" }) as Record<string, unknown>)["amount:1"]).toBe(0);
  });

  it("meldet Fehler am Feld der betroffenen TOP", () => {
    const result = schema.safeParse({ startDate: "kein-datum", "amount:2": "abc" });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["startDate", "amount:2"]));
  });
});
