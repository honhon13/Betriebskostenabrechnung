import { describe, expect, it } from "vitest";

import { detectFileType, sanitizeFileName } from "@/lib/files";
import { safeRedirectPath } from "@/lib/form-data";
import { mapInvoiceFields } from "@/services/ocr/azure-document-intelligence";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
const text = (value: string) => new TextEncoder().encode(value.padEnd(32, " "));

describe("detectFileType", () => {
  it("erkennt erlaubte Formate am Inhalt", () => {
    expect(detectFileType(text("%PDF-1.7"))).toBe("application/pdf");
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectFileType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectFileType(text("\0\0\0\x18ftypheic"))).toBe("image/heic");
  });

  it("lehnt HTML, SVG und Unbekanntes ab – unabhängig von der Dateiendung", () => {
    expect(detectFileType(text("<!doctype html><script>"))).toBeNull();
    expect(detectFileType(text("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(detectFileType(text("MZ executable"))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("entfernt Pfade und Steuerzeichen", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\x\\Rechnung 2025.pdf")).toBe("Rechnung 2025.pdf");
    expect(sanitizeFileName('a"b<c>.pdf')).toBe("abc.pdf");
    expect(sanitizeFileName("")).toBe("beleg");
  });
});

describe("safeRedirectPath", () => {
  it("lässt nur interne Pfade zu", () => {
    expect(safeRedirectPath("/abrechnung/2025", "/dashboard")).toBe("/abrechnung/2025");
    expect(safeRedirectPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath(null, "/dashboard")).toBe("/dashboard");
  });
});

describe("mapInvoiceFields (Azure Document Intelligence)", () => {
  it("übernimmt Datum, Rechnungsnummer, Lieferant und Betrag", () => {
    const fields = mapInvoiceFields({
      InvoiceDate: { valueDate: "2025-03-31", confidence: 0.98 },
      InvoiceId: { valueString: " RE-2025-0042 ", confidence: 0.96 },
      VendorName: { valueString: "Stadtwerke\nMusterstadt", confidence: 0.9 },
      InvoiceTotal: { valueCurrency: { amount: 1284.6, currencyCode: "EUR" }, confidence: 0.92 },
    });
    expect(fields).toMatchObject({
      documentDate: "2025-03-31",
      invoiceNumber: "RE-2025-0042",
      supplier: "Stadtwerke Musterstadt",
      amountCents: 128460,
      currency: "EUR",
    });
    expect(fields.confidence).toBeCloseTo(0.94, 2);
  });

  it("fällt auf den fälligen Betrag zurück und lässt Fehlendes leer", () => {
    const fields = mapInvoiceFields({
      AmountDue: { valueCurrency: { amount: 19.99 }, confidence: 0.5 },
    });
    expect(fields).toEqual({
      documentDate: null,
      invoiceNumber: null,
      supplier: null,
      amountCents: 1999,
      currency: null,
      confidence: 0.5,
    });
  });
});
