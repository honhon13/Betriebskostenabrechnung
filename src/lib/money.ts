/**
 * Wandelt eine Betragseingabe in Cent um, ohne über Gleitkommazahlen zu gehen.
 * Akzeptiert deutsche und englische Schreibweise: "1.234,56", "1234,56", "1234.56", "-12,5", "€ 80".
 * Gibt null zurück, wenn die Eingabe kein Betrag mit höchstens zwei Nachkommastellen ist.
 */
export function parseEuroToCents(input: string): number | null {
  let text = input.replace(/[\s€'’]/g, "");
  if (!text) return null;

  let negative = false;
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let decimalSeparator: "," | "." | null = null;

  if (lastComma !== -1 && lastDot !== -1) {
    // Beide vorhanden: das letzte Zeichen ist das Dezimaltrennzeichen.
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma !== -1) {
    decimalSeparator = ",";
  } else if (lastDot !== -1) {
    // "1.234" ist im Deutschen ein Tausenderpunkt, "12.5" eine Dezimalzahl.
    decimalSeparator = /^\d{1,3}(\.\d{3})+$/.test(text) ? null : ".";
  }

  const thousandsSeparator = decimalSeparator === "," ? "." : ",";
  const [integerRaw, fraction = "", ...rest] =
    decimalSeparator === null ? [text] : text.split(decimalSeparator);
  if (rest.length > 0) return null;

  const integer = integerRaw.split(decimalSeparator === null ? "." : thousandsSeparator).join("");
  if (!/^\d+$/.test(integer || "0") || !/^\d{0,2}$/.test(fraction)) return null;

  const cents = Number(integer || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Cent → Eingabewert für Formulare, z. B. 123456 → "1234,56". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const abs = Math.abs(cents);
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `-${text}` : text;
}
