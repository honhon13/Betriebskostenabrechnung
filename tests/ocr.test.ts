import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AzureDocumentIntelligenceOcrService,
  describeAzureError,
  mapInvoiceFields,
  mapRawFields,
} from "@/services/ocr/azure-document-intelligence";
import { OcrError } from "@/services/ocr/types";

const currency = (amount: number, confidence = 0.9) => ({
  type: "currency",
  valueCurrency: { amount, currencyCode: "EUR" },
  content: String(amount),
  confidence,
});

/** Felder, wie sie das Modell prebuilt-invoice für eine typische Rechnung liefert. */
const invoiceFields = {
  VendorName: { type: "string", valueString: "Rauchfangkehrer\nMuster GmbH", content: "Rauchfangkehrer Muster GmbH", confidence: 0.95 },
  InvoiceId: { type: "string", valueString: " RE-2026-0042 ", content: "RE-2026-0042", confidence: 0.97 },
  InvoiceDate: { type: "date", valueDate: "2026-03-15", content: "15.03.2026", confidence: 0.98 },
  ServiceStartDate: { type: "date", valueDate: "2026-01-01", content: "01.01.2026", confidence: 0.9 },
  ServiceEndDate: { type: "date", valueDate: "2026-03-31", content: "31.03.2026", confidence: 0.9 },
  SubTotal: currency(179),
  TotalTax: currency(35.8),
  InvoiceTotal: currency(214.8, 0.96),
  TaxDetails: {
    type: "array",
    valueArray: [{ type: "object", valueObject: { Rate: { type: "string", valueString: "20 %" } } }],
  },
  Items: {
    type: "array",
    valueArray: [
      { type: "object", valueObject: { Description: { type: "string", valueString: "Kehrung" } } },
      { type: "object", valueObject: { Description: { type: "string", valueString: "Abgasmessung" } } },
      { type: "object", valueObject: { Amount: currency(10) } },
    ],
  },
};

describe("mapInvoiceFields", () => {
  it("übernimmt Rechnungssteller, Nummer, Datum, Leistungszeitraum, Beträge und Beschreibung", () => {
    expect(mapInvoiceFields(invoiceFields)).toMatchObject({
      supplier: "Rauchfangkehrer Muster GmbH",
      invoiceNumber: "RE-2026-0042",
      documentDate: "2026-03-15",
      servicePeriodStart: "2026-01-01",
      servicePeriodEnd: "2026-03-31",
      netAmountCents: 179_00,
      taxAmountCents: 35_80,
      amountCents: 214_80,
      taxRate: "20 %",
      description: "Kehrung, Abgasmessung",
      currency: "EUR",
    });
  });

  it("lässt nicht erkannte Felder leer, statt etwas zu erfinden", () => {
    expect(mapInvoiceFields({ InvoiceId: { valueString: "4711", confidence: 0.8 } })).toEqual({
      supplier: null,
      invoiceNumber: "4711",
      documentDate: null,
      servicePeriodStart: null,
      servicePeriodEnd: null,
      netAmountCents: null,
      taxAmountCents: null,
      amountCents: null,
      taxRate: null,
      description: null,
      currency: null,
      confidence: 0.8,
    });
    expect(mapInvoiceFields({}).confidence).toBeNull();
  });

  it("nimmt den fälligen Betrag, wenn kein Gesamtbetrag ausgewiesen ist", () => {
    expect(mapInvoiceFields({ AmountDue: currency(19.99) }).amountCents).toBe(19_99);
  });

  it("rundet Beträge kaufmännisch auf Cent und verwirft unlesbare Daten", () => {
    expect(mapInvoiceFields({ InvoiceTotal: currency(1284.6) }).amountCents).toBe(128460);
    expect(mapInvoiceFields({ InvoiceDate: { valueDate: "15.03.2026", content: "15.03.2026" } }).documentDate).toBeNull();
  });

  it("speichert die Rohfelder kompakt mit", () => {
    expect(mapRawFields(invoiceFields).InvoiceId).toEqual({ content: "RE-2026-0042", confidence: 0.97 });
    expect(Object.keys(mapRawFields(invoiceFields))).toContain("Items");
  });
});

describe("describeAzureError", () => {
  it("erklärt nicht lesbare und nicht unterstützte Dokumente", () => {
    const message = describeAzureError(
      { code: "InvalidRequest", message: "Invalid request.", innererror: { code: "InvalidContent", message: "The file is corrupted or format is unsupported." } },
      400,
    );
    expect(message).toContain("nicht lesbar");
  });

  it("unterscheidet Zugangsdaten, Kontingent und Größe", () => {
    expect(describeAzureError({ code: "401", message: "Access denied" }, 401)).toContain("Zugangsdaten");
    expect(describeAzureError(undefined, 429)).toContain("Kontingent");
    expect(describeAzureError({ code: "InvalidRequest", innererror: { code: "InvalidContentLength" } }, 400)).toContain("zu groß");
    expect(describeAzureError(undefined, 404)).toContain("Konfiguration");
  });

  it("reicht unbekannte Fehler mit dem Text des Dienstes durch", () => {
    expect(describeAzureError({ code: "InternalServerError", message: "Boom" }, 500)).toBe(
      "Die OCR-Auswertung ist fehlgeschlagen: Boom",
    );
    expect(describeAzureError(undefined, 502)).toBe("Die OCR-Auswertung ist fehlgeschlagen (Status 502).");
  });
});

describe("AzureDocumentIntelligenceOcrService", () => {
  const ENDPOINT = "https://bk-ocr.cognitiveservices.azure.com";
  const OPERATION = `${ENDPOINT}/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/abc?api-version=2024-11-30`;
  const document = { bytes: Buffer.from("%PDF-1.4 test"), mimeType: "application/pdf" };
  const service = new AzureDocumentIntelligenceOcrService({ pollIntervalMs: 1 });

  beforeEach(() => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", `${ENDPOINT}/`);
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY", "geheimer-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** Ersetzt fetch durch vorbereitete Antworten und merkt sich die Anfragen. */
  function stubFetch(...responses: (Response | Error)[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unerwartete Anfrage");
      if (next instanceof Error) throw next;
      return next;
    });
    return calls;
  }
  const accepted = () => new Response(null, { status: 202, headers: { "Operation-Location": OPERATION } });
  const json = (body: unknown, status = 200) => Response.json(body, { status });

  it("ist nur mit Endpoint und Key konfiguriert", () => {
    expect(service.isConfigured()).toBe(true);
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY", "");
    expect(service.isConfigured()).toBe(false);
  });

  it("kennt die von Azure unterstützten Formate – WebP gehört nicht dazu", () => {
    expect(service.supports("application/pdf")).toBe(true);
    expect(service.supports("image/jpeg")).toBe(true);
    expect(service.supports("image/heic")).toBe(true);
    expect(service.supports("image/webp")).toBe(false);
  });

  it("schickt das Dokument an die REST-API, wartet auf das Ergebnis und ordnet die Felder zu", async () => {
    const calls = stubFetch(
      accepted(),
      json({ status: "running" }),
      json({ status: "succeeded", analyzeResult: { documents: [{ fields: invoiceFields }] } }),
    );

    const result = await service.analyzeInvoice(document);

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe(
      `${ENDPOINT}/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30`,
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("geheimer-key");
    // Das Original geht unverändert (Base64) an den Dienst.
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      base64Source: document.bytes.toString("base64"),
    });
    expect(calls[1].url).toBe(OPERATION);

    expect(result.provider).toBe("azure-document-intelligence");
    expect(result.model).toBe("prebuilt-invoice");
    expect(result.fields.invoiceNumber).toBe("RE-2026-0042");
    expect(result.fields.amountCents).toBe(214_80);
    expect(result.raw.VendorName.confidence).toBe(0.95);
  });

  it("liefert leere Felder, wenn im Dokument keine Rechnung erkannt wird", async () => {
    stubFetch(accepted(), json({ status: "succeeded", analyzeResult: { documents: [] } }));
    const result = await service.analyzeInvoice(document);
    expect(Object.values(result.fields).every((value) => value === null)).toBe(true);
  });

  it("verwendet Modell und API-Version aus der Umgebung", async () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_MODEL", "prebuilt-receipt");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_API_VERSION", "2025-01-01");
    const calls = stubFetch(accepted(), json({ status: "succeeded", analyzeResult: {} }));
    await service.analyzeInvoice(document);
    expect(calls[0].url).toContain("/documentModels/prebuilt-receipt:analyze?api-version=2025-01-01");
  });

  it("meldet nicht lesbare Dokumente verständlich", async () => {
    stubFetch(
      json({ error: { code: "InvalidRequest", message: "Invalid request.", innererror: { code: "InvalidContent", message: "The file is corrupted or format is unsupported." } } }, 400),
    );
    await expect(service.analyzeInvoice(document)).rejects.toThrow(/nicht lesbar/);
  });

  it("meldet eine fehlgeschlagene Analyse, falsche Zugangsdaten und Netzwerkfehler als OcrError", async () => {
    stubFetch(accepted(), json({ status: "failed", error: { code: "InternalServerError", message: "Analyse abgebrochen" } }));
    await expect(service.analyzeInvoice(document)).rejects.toThrow("Analyse abgebrochen");

    stubFetch(json({ error: { code: "401", message: "Access denied due to invalid subscription key." } }, 401));
    await expect(service.analyzeInvoice(document)).rejects.toThrow(/Zugangsdaten/);

    stubFetch(new TypeError("fetch failed"));
    const error = await service.analyzeInvoice(document).catch((e) => e);
    expect(error).toBeInstanceOf(OcrError);
    expect(error.message).toContain("nicht erreichbar");
  });

  it("lehnt nicht unterstützte Formate und fehlende Konfiguration ab, ohne den Dienst aufzurufen", async () => {
    const calls = stubFetch();
    await expect(service.analyzeInvoice({ bytes: document.bytes, mimeType: "image/webp" })).rejects.toThrow(
      "Dieses Dateiformat kann nicht per OCR ausgelesen werden.",
    );
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "");
    await expect(service.analyzeInvoice(document)).rejects.toThrow("OCR ist nicht eingerichtet.");
    expect(calls).toHaveLength(0);
  });
});
