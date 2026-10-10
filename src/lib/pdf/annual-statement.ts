import { formatCents, formatCredit, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { PeriodStatus, Statement, StatementLine } from "@/types/billing";

import { PdfLayout, type TableColumn, type TableRow } from "./layout";

/** Alles, was in die Jahresabrechnung einfließt – bereits auf den Sichtbereich beschränkt. */
export interface AnnualStatementData {
  year: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  releasedAt: string | null;
  /** null = Gesamtabrechnung aller TOPs, sonst die Abrechnung dieser einen TOP. */
  focus: { unitId: number; unitName: string } | null;
  /** Nur freigegebene Kostenpositionen, Belege nur soweit freigegeben. */
  statement: Statement;
  /** Eingegangene, freigegebene Einzahlungen. */
  payments: {
    unitId: number;
    unitName: string;
    paymentDate: string;
    amountCents: number;
    purpose: string | null;
  }[];
  generatedAt: Date;
}

/** Guthaben, Nachzahlung oder ausgeglichen – mit Betrag. */
export function describeBalance(cents: number): string {
  if (cents > 0) return `Guthaben ${formatCents(cents)}`;
  if (cents < 0) return `Nachzahlung ${formatCents(-cents)}`;
  return "Ausgeglichen";
}

/** Dateiname für Anzeige und Download. */
export function annualStatementFileName(data: Pick<AnnualStatementData, "year" | "focus">): string {
  const unit = data.focus ? `-${data.focus.unitName.replace(/[^\p{L}\p{N}]+/gu, "-")}` : "";
  return `Betriebskostenabrechnung-${data.year}${unit}.pdf`;
}

const AMOUNT = 72;

/** Kostenpositionen in der Reihenfolge der Abrechnung, nach Kostenart gruppiert. */
function byCategory(lines: StatementLine[]): { name: string; lines: StatementLine[] }[] {
  const groups = new Map<number, { name: string; lines: StatementLine[] }>();
  for (const line of lines) {
    const group = groups.get(line.categoryId) ?? { name: line.categoryName, lines: [] };
    group.lines.push(line);
    groups.set(line.categoryId, group);
  }
  return [...groups.values()];
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const shareOf = (line: StatementLine, unitId: number) =>
  line.shares.find((share) => share.unitId === unitId);

/**
 * Erzeugt die Jahresabrechnung als druckbares PDF: Ergebnis, Kostenaufstellung nach Kostenart,
 * Gutschriften, Einzahlungen und Belegübersicht. Gutschriften stehen nie zwischen den Kosten:
 * sie haben ihren eigenen Abschnitt, und das Ergebnis weist Kosten, Gutschriften und Nettokosten
 * getrennt aus. Rechnet nichts selbst – alle Beträge stammen aus der Abrechnung
 * (`buildStatement`), damit PDF und Oberfläche nie voneinander abweichen.
 */
export async function renderAnnualStatement(data: AnnualStatementData): Promise<Uint8Array> {
  const { statement, focus } = data;
  const units = statement.balances.map((balance) => ({ id: balance.unitId, name: balance.unitName }));
  const title = `Betriebskostenabrechnung ${data.year}`;
  const subject = focus ? focus.unitName : "Gesamtabrechnung aller TOPs";

  const pdf = await PdfLayout.create({
    title: `${title} – ${subject}`,
    footer: `${title} · ${subject} · erstellt am ${formatDateTime(data.generatedAt)}`,
    // Ab fünf TOPs passen die Anteilsspalten nur noch im Querformat nebeneinander.
    landscape: !focus && units.length > 4,
  });

  // --- Kopf ---------------------------------------------------------------
  pdf.title(title);
  pdf.text(subject, { size: 12, bold: true, gap: 4 });
  pdf.muted(`Abrechnungszeitraum ${formatDate(data.startDate)} – ${formatDate(data.endDate)}`);
  pdf.muted(
    data.status === "released"
      ? `Freigegeben${data.releasedAt ? ` am ${formatDateTime(data.releasedAt)}` : ""}`
      : "Status: Entwurf",
    { gap: 10 },
  );
  if (data.status !== "released") {
    pdf.notice(
      "Entwurf – noch nicht freigegeben",
      "Diese Abrechnung ist ein Zwischenstand. Verbindlich wird sie erst mit der Freigabe; bis dahin können sich Kosten und Umlageschlüssel ändern.",
    );
  }

  // --- Ergebnis -----------------------------------------------------------
  pdf.heading("Ergebnis");
  const costLines = statement.lines.filter((line) => !line.credit);
  const creditLines = statement.lines.filter((line) => line.credit);
  const distributed = sum(statement.balances.map((balance) => balance.costCents));
  const hasCredits = creditLines.length > 0;
  const creditsLabel = `Gutschriften (${statement.creditCount})`;
  // Mit Gutschriften steht die Kostenseite in einer eigenen Reihe: Kosten, Gutschriften, Nettokosten.
  // Ohne sie genügt eine Reihe – die Position „Gutschriften (0)“ folgt als Zeile darunter.
  const noCredits = () =>
    pdf.muted(`${creditsLabel}: ${formatCredit(0)} – in diesem Abrechnungsjahr gibt es keine.`, {
      gap: 8,
    });
  if (focus) {
    const balance = statement.balances[0];
    const net = { label: "Kostenanteil", value: formatCents(balance?.costCents ?? 0) };
    const result = [
      { label: "Eingegangene Einzahlungen", value: formatCents(balance?.paymentCents ?? 0) },
      { label: "Ergebnis", value: describeBalance(balance?.balanceCents ?? 0), emphasis: true },
    ];
    if (hasCredits) {
      pdf.figures([
        { label: "Kosten (Anteil)", value: formatCents(balance?.costBeforeCreditsCents ?? 0) },
        { label: `${creditsLabel}, Anteil`, value: formatCredit(balance?.creditCents ?? 0) },
        { ...net, label: "Kostenanteil (Nettokosten)" },
      ]);
      pdf.figures(result);
    } else {
      pdf.figures([net, ...result]);
      noCredits();
    }
  } else {
    const net = { label: "Nettokosten", value: formatCents(statement.totalCostCents) };
    const result = [
      { label: "Eingegangene Einzahlungen", value: formatCents(statement.totalPaymentCents) },
      {
        label: "Differenz",
        value: describeBalance(statement.totalPaymentCents - statement.totalCostCents),
        emphasis: true,
      },
    ];
    if (hasCredits) {
      pdf.figures([
        { label: "Kosten", value: formatCents(statement.costBeforeCreditsCents) },
        { label: creditsLabel, value: formatCredit(statement.creditCents) },
        net,
      ]);
      pdf.figures(result);
    } else {
      pdf.figures([net, ...result]);
      noCredits();
    }
    pdf.table(
      [
        { header: "TOP", width: null },
        { header: "Kostenanteil", width: 110, align: "right" },
        { header: "Einzahlungen", width: 110, align: "right" },
        { header: "Guthaben / Nachzahlung", width: 150, align: "right" },
      ],
      [
        ...statement.balances.map((balance) => ({
          cells: [
            balance.unitName,
            formatCents(balance.costCents),
            formatCents(balance.paymentCents),
            describeBalance(balance.balanceCents),
          ],
        })),
        {
          style: "total" as const,
          cells: [
            "Summe",
            formatCents(distributed),
            formatCents(statement.totalPaymentCents),
            describeBalance(statement.totalPaymentCents - distributed),
          ],
        },
      ],
    );
  }
  if (statement.undistributedCents !== 0) {
    pdf.notice(
      "Nicht alle Kosten sind verteilt",
      `${formatCents(statement.undistributedCents)} konnten keiner TOP zugeordnet werden, weil die Summe der Schlüsselwerte 0 ist. Dieser Betrag ist in keinem Kostenanteil enthalten.`,
    );
  }

  // --- Kostenaufstellung und Gutschriften ---------------------------------
  // Beide Abschnitte haben dieselben Spalten: je Position der Gesamtbetrag und die Anteile.
  const amountOf = (lines: StatementLine[]) => sum(lines.map((line) => line.amountCents));
  let columns: TableColumn[];
  let positionRows: (lines: StatementLine[]) => TableRow[];
  /** Summenzeile: Beschriftung, Gesamtbetrag und Anteil(e) der übergebenen Positionen. */
  let totalCells: (label: string, lines: StatementLine[]) => TableRow["cells"];

  if (focus) {
    const own = (line: StatementLine) => shareOf(line, focus.unitId);
    const ownShare = (lines: StatementLine[]) => sum(lines.map((line) => own(line)?.cents ?? 0));
    columns = [
      { header: "Position", width: null },
      { header: "Umlageschlüssel", width: 125 },
      { header: "Gesamt", width: AMOUNT, align: "right" },
      { header: `Anteil ${focus.unitName}`, width: 84, align: "right" },
    ];
    totalCells = (label, lines) => [
      label,
      "",
      formatCents(amountOf(lines)),
      formatCents(ownShare(lines)),
    ];
    positionRows = (lines) =>
      byCategory(lines).flatMap((group) => [
        { style: "group" as const, cells: [group.name, "", "", ""] },
        ...group.lines.map((line) => {
          const share = own(line);
          return {
            cells: [
              { text: line.description, sub: line.costDate ? formatDate(line.costDate) : undefined },
              {
                text: line.keyName,
                sub:
                  line.distributable && line.keyUnitLabel && share
                    ? `${formatNumber(share.weight)} von ${formatNumber(line.totalWeight)} ${line.keyUnitLabel}`
                    : undefined,
              },
              formatCents(line.amountCents),
              formatCents(share?.cents ?? 0),
            ],
          };
        }),
        ...(group.lines.length > 1
          ? [{ style: "subtotal" as const, cells: totalCells(`Summe ${group.name}`, group.lines) }]
          : []),
      ]);
  } else {
    const shares = (lines: StatementLine[]) =>
      units.map((unit) => formatCents(sum(lines.map((line) => shareOf(line, unit.id)?.cents ?? 0))));
    columns = [
      { header: "Position", width: null },
      { header: "Gesamt", width: AMOUNT, align: "right" },
      ...units.map((unit) => ({ header: unit.name, width: 64, align: "right" as const })),
    ];
    totalCells = (label, lines) => [label, formatCents(amountOf(lines)), ...shares(lines)];
    positionRows = (lines) =>
      byCategory(lines).flatMap((group) => [
        { style: "group" as const, cells: [group.name] },
        ...group.lines.map((line) => ({
          cells: [
            {
              text: line.description,
              sub: [line.costDate && formatDate(line.costDate), line.keyName]
                .filter(Boolean)
                .join(" · "),
            },
            formatCents(line.amountCents),
            ...units.map((unit) => {
              const share = shareOf(line, unit.id);
              return share ? formatCents(share.cents) : "–";
            }),
          ],
        })),
        ...(group.lines.length > 1
          ? [{ style: "subtotal" as const, cells: totalCells(`Summe ${group.name}`, group.lines) }]
          : []),
      ]);
  }
  const netLabel = focus ? `Kostenanteil ${focus.unitName}` : "Nettokosten";

  pdf.heading("Kostenaufstellung");
  if (costLines.length === 0) {
    pdf.muted("Für dieses Jahr gibt es keine freigegebenen Kostenpositionen.", { gap: 6 });
  } else {
    pdf.table(columns, [
      ...positionRows(costLines),
      // Ohne Gutschriften sind die Kosten zugleich das Ergebnis der Aufstellung.
      { style: "total", cells: totalCells(hasCredits ? "Summe Kosten" : netLabel, costLines) },
    ]);
  }

  if (hasCredits) {
    pdf.heading("Gutschriften");
    pdf.muted(
      "Gutschriften mindern die Kosten. Sie sind eigene Positionen – die Kostenpositionen oben bleiben unverändert.",
      { gap: 4 },
    );
    pdf.table(columns, [
      ...positionRows(creditLines),
      { style: "subtotal", cells: totalCells("Summe Gutschriften", creditLines) },
      { style: "subtotal", cells: totalCells("Summe Kosten", costLines) },
      { style: "total", cells: totalCells(netLabel, statement.lines) },
    ]);
  }

  // --- Einzahlungen -------------------------------------------------------
  pdf.heading("Einzahlungen");
  const payments = [...data.payments].sort(
    (a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.unitName.localeCompare(b.unitName),
  );
  if (payments.length === 0) {
    pdf.muted("Für dieses Jahr sind keine eingegangenen Einzahlungen verbucht.", { gap: 6 });
  } else {
    pdf.table(
      [
        { header: "Datum", width: 66 },
        ...(focus ? [] : [{ header: "TOP", width: 80 }]),
        { header: "Verwendungszweck", width: null },
        { header: "Betrag", width: 90, align: "right" as const },
      ],
      [
        ...payments.map((payment) => ({
          cells: [
            formatDate(payment.paymentDate),
            ...(focus ? [] : [payment.unitName]),
            payment.purpose ?? "Einzahlung",
            formatCents(payment.amountCents),
          ],
        })),
        {
          style: "total" as const,
          cells: [
            "Summe",
            ...(focus ? [] : [""]),
            "",
            formatCents(sum(payments.map((payment) => payment.amountCents))),
          ],
        },
      ],
    );
  }

  // --- Belegübersicht -----------------------------------------------------
  pdf.heading("Belegübersicht");
  if (statement.lines.length === 0) {
    pdf.muted("Keine Kostenpositionen – daher keine Belege.", { gap: 6 });
  } else {
    pdf.table(
      [
        { header: "Position", width: null },
        { header: "Betrag", width: AMOUNT, align: "right" },
        { header: "Belege", width: 210 },
      ],
      statement.lines.map((line) => ({
        cells: [
          {
            text: line.description,
            sub: [
              line.credit && "Gutschrift",
              line.categoryName,
              line.costDate && formatDate(line.costDate),
            ]
              .filter(Boolean)
              .join(" · "),
          },
          formatCents(line.amountCents),
          line.documents.length > 0
            ? line.documents.map((document) => document.fileName).join(", ")
            : "Kein Beleg hinterlegt",
        ],
      })),
    );
  }

  pdf.gap(4);
  pdf.muted(
    "Berücksichtigt sind ausschließlich freigegebene Kostenpositionen und eingegangene, freigegebene Einzahlungen. " +
      "Gutschriften mindern die Kosten: Nettokosten = Kosten minus Gutschriften. " +
      "Guthaben bzw. Nachzahlung ergibt sich aus Einzahlungen minus Kostenanteil (Nettokosten). " +
      "Die Belege liegen in der Anwendung unter „Dokumente“.",
    { size: 7.5 },
  );

  return pdf.finish();
}
