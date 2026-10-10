// Nachbau der Azure-Document-Intelligence-REST-API für die End-to-End-Tests.
// Verhält sich wie der echte Dienst (202 + Operation-Location, Abholen per Polling,
// Fehlerformat), liefert aber feste Ergebnisse – gesteuert über eine Marke im Dokument:
//   OCR-RECHNUNG   → vollständig erkannte Rechnung
//   OCR-GUTSCHRIFT → Gutschrift desselben Rechnungsstellers – wie beim echten Dienst mit positiven
//                    Beträgen; dass es eine Gutschrift ist, steht nur im erkannten Text
//   OCR-UNKLAR     → Rechnung, deren Inhalt zu keiner Kostenart passt
//   OCR-UNLESBAR   → Dienst lehnt die Datei als beschädigt ab
//   sonst          → Analyse erfolgreich, aber keine Rechnungsdaten erkannt
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_AZURE_PORT ?? 3101);
const KEY = process.env.MOCK_AZURE_KEY ?? "e2e-test-key";
const operations = new Map();

const currency = (amount) => ({
  type: "currency",
  valueCurrency: { amount, currencyCode: "EUR", currencySymbol: "€" },
  content: String(amount),
  confidence: 0.93,
});

const INVOICE_FIELDS = {
  VendorName: { type: "string", valueString: "Rauchfangkehrer Muster GmbH", content: "Rauchfangkehrer Muster GmbH", confidence: 0.95 },
  InvoiceId: { type: "string", valueString: "RE-2026-0042", content: "RE-2026-0042", confidence: 0.97 },
  InvoiceDate: { type: "date", valueDate: "2026-03-15", content: "15.03.2026", confidence: 0.98 },
  ServiceStartDate: { type: "date", valueDate: "2026-01-01", content: "01.01.2026", confidence: 0.9 },
  ServiceEndDate: { type: "date", valueDate: "2026-03-31", content: "31.03.2026", confidence: 0.9 },
  SubTotal: currency(179),
  TotalTax: currency(35.8),
  InvoiceTotal: currency(214.8),
  TaxDetails: {
    type: "array",
    valueArray: [{ type: "object", valueObject: { Rate: { type: "string", valueString: "20 %", content: "20 %" } } }],
  },
  Items: {
    type: "array",
    valueArray: [
      { type: "object", valueObject: { Description: { type: "string", valueString: "Kehrung", content: "Kehrung" } } },
      { type: "object", valueObject: { Description: { type: "string", valueString: "Abgasmessung", content: "Abgasmessung" } } },
    ],
  },
};

const item = (description) => ({
  type: "object",
  valueObject: { Description: { type: "string", valueString: description, content: description } },
});

/** Ergebnis je Marke: erkannte Felder und der Volltext des Dokuments (`analyzeResult.content`). */
const RESULTS = {
  "OCR-GUTSCHRIFT": {
    fields: {
      VendorName: INVOICE_FIELDS.VendorName,
      InvoiceId: { type: "string", valueString: "GS-2026-0007", content: "GS-2026-0007", confidence: 0.96 },
      InvoiceDate: { type: "date", valueDate: "2026-04-02", content: "02.04.2026", confidence: 0.98 },
      SubTotal: currency(50),
      TotalTax: currency(10),
      InvoiceTotal: currency(60),
      Items: { type: "array", valueArray: [item("Gutschrift Abgasmessung")] },
    },
    content:
      "Rauchfangkehrer Muster GmbH\nGutschrift Nr. GS-2026-0007\nzur Rechnung RE-2026-0042 vom 15.03.2026\n" +
      "Pos Bezeichnung Betrag\n1 Gutschrift Abgasmessung 50,00\nMwSt. 20 % 10,00\nGesamt 60,00",
  },
  "OCR-UNKLAR": {
    fields: {
      VendorName: { type: "string", valueString: "Muster Handels GmbH", content: "Muster Handels GmbH", confidence: 0.94 },
      InvoiceId: { type: "string", valueString: "MH-77", content: "MH-77", confidence: 0.95 },
      InvoiceDate: { type: "date", valueDate: "2026-05-20", content: "20.05.2026", confidence: 0.98 },
      InvoiceTotal: currency(120),
      Items: { type: "array", valueArray: [item("Diverse Leistungen")] },
    },
    content:
      "Muster Handels GmbH\nRechnung Nr. MH-77\nPos Bezeichnung Betrag\n1 Diverse Leistungen 120,00\nGesamt 120,00",
  },
  "OCR-RECHNUNG": {
    fields: INVOICE_FIELDS,
    content:
      "Rauchfangkehrer Muster GmbH\nRechnung Nr. RE-2026-0042\nRechnungsdatum 15.03.2026\n" +
      "Pos Bezeichnung Betrag\n1 Kehrung 120,00\n2 Abgasmessung 59,00\nMwSt. 20 % 35,80\nGesamt 214,80",
  },
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(body === null ? undefined : JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });

  if (request.headers["ocp-apim-subscription-key"] !== KEY) {
    return send(response, 401, {
      error: { code: "401", message: "Access denied due to invalid subscription key or wrong API endpoint." },
    });
  }

  const analyze = /^\/documentintelligence\/documentModels\/([^/:]+):analyze$/.exec(url.pathname);
  if (request.method === "POST" && analyze) {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    let content = "";
    try {
      content = Buffer.from(JSON.parse(raw).base64Source, "base64").toString("latin1");
    } catch {
      return send(response, 400, { error: { code: "InvalidRequest", message: "Invalid request." } });
    }

    if (content.includes("OCR-UNLESBAR")) {
      return send(response, 400, {
        error: {
          code: "InvalidRequest",
          message: "Invalid request.",
          innererror: { code: "InvalidContent", message: "The file is corrupted or format is unsupported." },
        },
      });
    }

    const id = randomUUID();
    const marker = Object.keys(RESULTS).find((key) => content.includes(key));
    operations.set(id, { polls: 0, result: marker ? RESULTS[marker] : null });
    return send(response, 202, null, {
      "Operation-Location": `http://localhost:${PORT}/documentintelligence/documentModels/${analyze[1]}/analyzeResults/${id}?api-version=${url.searchParams.get("api-version")}`,
    });
  }

  const result = /^\/documentintelligence\/documentModels\/[^/]+\/analyzeResults\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && result) {
    const operation = operations.get(result[1]);
    if (!operation) return send(response, 404, { error: { code: "NotFound", message: "Resource not found." } });
    // Wie beim echten Dienst ist das Ergebnis nicht sofort da.
    if (operation.polls++ === 0) return send(response, 200, { status: "running" });
    return send(response, 200, {
      status: "succeeded",
      analyzeResult: {
        apiVersion: url.searchParams.get("api-version"),
        modelId: "prebuilt-invoice",
        content: operation.result?.content ?? "",
        documents: operation.result
          ? [{ docType: "invoice", fields: operation.result.fields, confidence: 1 }]
          : [],
      },
    });
  }

  send(response, 404, { error: { code: "NotFound", message: "Resource not found." } });
});

server.listen(PORT, () => console.log(`Azure-Nachbau läuft auf http://localhost:${PORT}`));
