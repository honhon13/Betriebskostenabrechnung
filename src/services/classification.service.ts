import "server-only";

import { and, count, eq, inArray, isNotNull, ne, notExists, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { costCategories, costs, documentLinks, documents, recurringCosts } from "@/db/schema";
import { suggestCategory, type CategoryHistoryEntry } from "@/lib/ocr/category-suggestion";
import { detectDocumentKind } from "@/lib/ocr/document-kind";
import { RECEIPT_TYPES } from "@/lib/labels";
import type { OcrClassification } from "@/types/billing";

import type { OcrResult } from "./ocr";

/**
 * Bisherige Zuordnungen Rechnungssteller → Kostenart. Gelernt wird aus dem, was offiziell zählt:
 * freigegebene Kostenpositionen, Vorlagen für wiederkehrende Kosten und freigegebene Belege, die
 * (noch) an keiner Kostenposition hängen. Eingereichtes und Abgelehntes bleibt außen vor – eine
 * ungeprüfte Eingabe soll künftige Belege nicht einsortieren.
 */
async function loadCategoryHistory(excludeDocumentId?: number): Promise<CategoryHistoryEntry[]> {
  const db = getDb();
  const [fromCosts, fromTemplates, fromDocuments] = await Promise.all([
    db
      .select({ supplier: costs.supplier, categoryId: costs.categoryId, count: count() })
      .from(costs)
      .where(and(isNotNull(costs.supplier), eq(costs.reviewStatus, "approved")))
      .groupBy(costs.supplier, costs.categoryId),
    db
      .select({
        supplier: recurringCosts.supplier,
        categoryId: recurringCosts.categoryId,
        count: count(),
      })
      .from(recurringCosts)
      .where(and(isNotNull(recurringCosts.supplier), eq(recurringCosts.isActive, true)))
      .groupBy(recurringCosts.supplier, recurringCosts.categoryId),
    db
      .select({ supplier: documents.supplier, categoryId: documents.categoryId, count: count() })
      .from(documents)
      .where(
        and(
          isNotNull(documents.supplier),
          isNotNull(documents.categoryId),
          eq(documents.reviewStatus, "approved"),
          inArray(documents.type, RECEIPT_TYPES),
          excludeDocumentId === undefined ? undefined : ne(documents.id, excludeDocumentId),
          // Verknüpfte Belege zählen bereits über ihre Kostenposition.
          notExists(
            db
              .select({ one: sql`1` })
              .from(documentLinks)
              .where(
                and(eq(documentLinks.documentId, documents.id), isNotNull(documentLinks.costId)),
              ),
          ),
        ),
      )
      .groupBy(documents.supplier, documents.categoryId),
  ]);

  return [...fromCosts, ...fromTemplates, ...fromDocuments].flatMap((row) =>
    row.supplier === null || row.categoryId === null
      ? []
      : [{ supplier: row.supplier, categoryId: row.categoryId, count: row.count }],
  );
}

/**
 * Wertet einen ausgelesenen Beleg aus: Rechnung oder Gutschrift, und welche Kostenart passt.
 * Das Ergebnis wird mit dem OCR-Ergebnis am Dokument gespeichert.
 *
 * Bewusst ohne eigene Rechteprüfung und nicht aus der Oberfläche erreichbar: der Aufrufer
 * (`processDocumentOcr`) hat das Recht `document:ocr` über alle TOPs bereits geprüft.
 */
export async function classifyReceipt(
  result: Pick<OcrResult, "fields" | "text">,
  options: {
    /** Das ausgelesene Dokument – bei erneutem Auslesen soll es sich nicht selbst bestätigen. */
    excludeDocumentId?: number;
  } = {},
): Promise<OcrClassification> {
  const db = getDb();
  const [categories, history] = await Promise.all([
    db
      .select({
        id: costCategories.id,
        name: costCategories.name,
        description: costCategories.description,
      })
      .from(costCategories)
      .where(eq(costCategories.isActive, true))
      .orderBy(costCategories.sortOrder, costCategories.name),
    loadCategoryHistory(options.excludeDocumentId),
  ]);

  const text = result.text ?? null;
  const kind = detectDocumentKind({ fields: result.fields, text });
  const suggestion = suggestCategory({
    supplier: result.fields.supplier,
    description: result.fields.description,
    text,
    categories,
    history,
  });

  return {
    documentType: kind.documentType,
    documentTypeCertain: kind.certain,
    documentTypeSignals: kind.signals,
    category: suggestion.category,
    categoryCertain: suggestion.certain,
    alternatives: suggestion.alternatives,
  };
}
