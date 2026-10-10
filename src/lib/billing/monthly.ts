export interface MonthRow {
  /** 1–12; null = Sammelzeile für Einträge ohne Datum bzw. außerhalb des Abrechnungsjahres. */
  month: number | null;
  /** Kostenpositionen des Monats – ohne Gutschriften. */
  costCents: number;
  /** Gutschriften des Monats, als positiver Betrag. */
  creditCents: number;
  paymentCents: number;
  /** Einzahlungen minus Nettokosten (Kosten abzüglich Gutschriften) des Monats. */
  differenceCents: number;
  /** Aufgelaufener Saldo bis einschließlich dieses Monats. */
  cumulativeCents: number;
}

export interface MonthlyOverview {
  rows: MonthRow[];
  /** Kosten ohne Datum und Zahlungen außerhalb des Jahres (z. B. Nachzahlung im Folgejahr). */
  other: MonthRow | null;
  /** Kostenpositionen des Jahres – ohne Gutschriften. */
  totalCostCents: number;
  /** Gutschriften des Jahres, als positiver Betrag. */
  totalCreditCents: number;
  totalPaymentCents: number;
}

interface Entry {
  /** ISO-Datum (YYYY-MM-DD) oder null. */
  date: string | null;
  cents: number;
}

function monthOf(date: string | null, year: number): number | null {
  if (!date || Number(date.slice(0, 4)) !== year) return null;
  const month = Number(date.slice(5, 7));
  return month >= 1 && month <= 12 ? month : null;
}

/**
 * Verteilt Kosten (nach Rechnungsdatum) und Einzahlungen (nach Zahlungsdatum) auf die
 * zwölf Monate eines Abrechnungsjahres. Kosten mit negativem Betrag sind Gutschriften und
 * stehen in einer eigenen Spalte. Alles, was sich keinem Monat des Jahres zuordnen lässt,
 * landet in `other` – die Jahressummen stimmen dadurch immer mit der Abrechnung überein.
 */
export function buildMonthlyOverview(
  year: number,
  costs: Entry[],
  payments: Entry[],
): MonthlyOverview {
  const cost = new Array<number>(13).fill(0);
  const credit = new Array<number>(13).fill(0);
  const payment = new Array<number>(13).fill(0);
  // Index 0 = Sammelzeile, 1–12 = Monate.
  for (const entry of costs) {
    const index = monthOf(entry.date, year) ?? 0;
    if (entry.cents < 0) credit[index] -= entry.cents;
    else cost[index] += entry.cents;
  }
  for (const entry of payments) payment[monthOf(entry.date, year) ?? 0] += entry.cents;

  const difference = (index: number) => payment[index] - (cost[index] - credit[index]);

  let cumulative = 0;
  const rows: MonthRow[] = [];
  for (let month = 1; month <= 12; month++) {
    const differenceCents = difference(month);
    cumulative += differenceCents;
    rows.push({
      month,
      costCents: cost[month],
      creditCents: credit[month],
      paymentCents: payment[month],
      differenceCents,
      cumulativeCents: cumulative,
    });
  }

  const hasOther = cost[0] !== 0 || credit[0] !== 0 || payment[0] !== 0;
  const otherDifference = difference(0);

  return {
    rows,
    other: hasOther
      ? {
          month: null,
          costCents: cost[0],
          creditCents: credit[0],
          paymentCents: payment[0],
          differenceCents: otherDifference,
          cumulativeCents: cumulative + otherDifference,
        }
      : null,
    totalCostCents: cost.reduce((a, b) => a + b, 0),
    totalCreditCents: credit.reduce((a, b) => a + b, 0),
    totalPaymentCents: payment.reduce((a, b) => a + b, 0),
  };
}
