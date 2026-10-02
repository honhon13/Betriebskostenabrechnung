import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, exists, sql } from "drizzle-orm";

import { authorize, authorizeGlobalWrite, getDataScope } from "@/auth/rbac";
import { getDb } from "@/db/client";
import { costCategories, costs, costUnits, receipts } from "@/db/schema";
import { DomainError, NotFoundError } from "@/lib/errors";
import {
  ALLOWED_FILE_TYPES,
  MAX_UPLOAD_BYTES,
  detectFileType,
  sanitizeFileName,
} from "@/lib/files";
import { formatFileSize } from "@/lib/format";
import type { ReceiptMetaInput } from "@/lib/validation";
import type { SessionUser } from "@/types/auth";
import type { OcrFields, ReceiptDto } from "@/types/billing";

import { getOcrService, OcrError, type OcrResult } from "./ocr";
import { getVisiblePeriod } from "./periods.service";
import { getDefaultStorageProvider, getStorage, isStoragePersistent, type StoredFile } from "./storage";

type ReceiptRow = typeof receipts.$inferSelect;

function toDto(row: ReceiptRow, costLabel: string | null): ReceiptDto {
  return {
    id: row.id,
    periodId: row.periodId,
    costId: row.costId,
    costLabel,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    documentDate: row.documentDate,
    supplier: row.supplier,
    invoiceNumber: row.invoiceNumber,
    amountCents: row.amountCents,
    notes: row.notes,
    ocrStatus: row.ocrStatus,
    ocr: (row.ocrResult as OcrResult | null)?.fields ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Ohne scope:all_units sind nur Belege sichtbar, die an einer Kostenposition hängen,
 * an der die eigene TOP beteiligt ist. Nicht zugeordnete Belege sieht nur die Verwaltung.
 */
function unitCondition(actor: SessionUser) {
  const scope = getDataScope(actor);
  if (scope.allUnits) return undefined;
  // Benutzer ohne TOP sehen keine Belege.
  if (scope.unitId === null) return sql`false`;

  return exists(
    getDb()
      .select({ one: costUnits.costId })
      .from(costUnits)
      .where(and(eq(costUnits.costId, receipts.costId), eq(costUnits.unitId, scope.unitId))),
  );
}

export async function listReceipts(actor: SessionUser, periodId: number): Promise<ReceiptDto[]> {
  authorize(actor, "receipt:read");
  await getVisiblePeriod(actor, periodId);

  const rows = await getDb()
    .select({
      receipt: receipts,
      costDescription: costs.description,
      categoryName: costCategories.name,
    })
    .from(receipts)
    .leftJoin(costs, eq(costs.id, receipts.costId))
    .leftJoin(costCategories, eq(costCategories.id, costs.categoryId))
    .where(and(eq(receipts.periodId, periodId), unitCondition(actor)))
    .orderBy(desc(receipts.createdAt), desc(receipts.id));

  return rows.map(({ receipt, costDescription, categoryName }) =>
    toDto(receipt, costDescription ? `${categoryName} – ${costDescription}` : null),
  );
}

/** Lädt einen Beleg im Sichtbereich des Benutzers – sonst „nicht gefunden“. */
async function getAccessibleReceipt(actor: SessionUser, receiptId: number): Promise<ReceiptRow> {
  const [row] = await getDb()
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, receiptId), unitCondition(actor)))
    .limit(1);
  if (!row) throw new NotFoundError("Der Beleg wurde nicht gefunden.");
  await getVisiblePeriod(actor, row.periodId);
  return row;
}

/** Eine verknüpfte Kostenposition muss zum selben Abrechnungsjahr gehören. */
async function assertCostInPeriod(costId: number | null, periodId: number): Promise<void> {
  if (costId === null) return;
  const [cost] = await getDb()
    .select({ id: costs.id })
    .from(costs)
    .where(and(eq(costs.id, costId), eq(costs.periodId, periodId)))
    .limit(1);
  if (!cost) throw new DomainError("Die Kostenposition gehört nicht zu diesem Abrechnungsjahr.");
}

function toColumns(meta: ReceiptMetaInput) {
  return {
    costId: meta.costId,
    documentDate: meta.documentDate,
    supplier: meta.supplier,
    invoiceNumber: meta.invoiceNumber,
    amountCents: meta.amount,
    notes: meta.notes,
  };
}

export interface UploadedFile {
  name: string;
  bytes: Buffer;
}

export async function uploadReceipt(
  actor: SessionUser,
  periodId: number,
  file: UploadedFile,
  meta: ReceiptMetaInput,
): Promise<number> {
  authorizeGlobalWrite(actor, "receipt:write");
  const period = await getVisiblePeriod(actor, periodId);
  await assertCostInPeriod(meta.costId, periodId);

  if (file.bytes.length === 0) throw new DomainError("Die Datei ist leer.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) {
    throw new DomainError(`Die Datei ist größer als ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
  }
  const mimeType = detectFileType(file.bytes);
  if (!mimeType) {
    const allowed = Object.values(ALLOWED_FILE_TYPES).map((t) => t.label).join(", ");
    throw new DomainError(`Dieses Dateiformat wird nicht unterstützt. Erlaubt sind: ${allowed}.`);
  }
  if (!isStoragePersistent()) {
    throw new DomainError(
      "Für Uploads ist noch kein dauerhafter Speicher eingerichtet (Vercel Blob verbinden).",
    );
  }

  const db = getDb();
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const [duplicate] = await db
    .select({ fileName: receipts.fileName })
    .from(receipts)
    .where(and(eq(receipts.periodId, periodId), eq(receipts.sha256, sha256)))
    .limit(1);
  if (duplicate) {
    throw new DomainError(`Diese Datei wurde bereits als „${duplicate.fileName}“ hochgeladen.`);
  }

  const storage = getStorage(getDefaultStorageProvider());
  const storageKey = `belege/${period.year}/${randomUUID()}.${ALLOWED_FILE_TYPES[mimeType].extension}`;
  await storage.put(storageKey, file.bytes, mimeType);

  try {
    const [row] = await db
      .insert(receipts)
      .values({
        ...toColumns(meta),
        periodId,
        storageProvider: storage.provider,
        storageKey,
        fileName: sanitizeFileName(file.name),
        mimeType,
        sizeBytes: file.bytes.length,
        sha256,
        uploadedBy: actor.id,
      })
      .returning({ id: receipts.id });
    return row.id;
  } catch (error) {
    // Ohne Datenbankeintrag wäre die Datei verwaist.
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function updateReceipt(
  actor: SessionUser,
  receiptId: number,
  meta: ReceiptMetaInput,
): Promise<void> {
  authorizeGlobalWrite(actor, "receipt:write");
  const receipt = await getAccessibleReceipt(actor, receiptId);
  await assertCostInPeriod(meta.costId, receipt.periodId);
  await getDb().update(receipts).set(toColumns(meta)).where(eq(receipts.id, receiptId));
}

export async function deleteReceipt(actor: SessionUser, receiptId: number): Promise<void> {
  authorizeGlobalWrite(actor, "receipt:delete");
  const receipt = await getAccessibleReceipt(actor, receiptId);

  await getDb().delete(receipts).where(eq(receipts.id, receiptId));
  try {
    await getStorage(receipt.storageProvider).delete(receipt.storageKey);
  } catch (error) {
    // Der Beleg ist gelöscht; eine übrig gebliebene Datei ist nur noch Speicherplatz.
    console.error(`Datei ${receipt.storageKey} konnte nicht gelöscht werden:`, error);
  }
}

export interface ReceiptFile {
  file: StoredFile;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Datei eines Belegs für Anzeige/Download – nach derselben Prüfung wie die Liste. */
export async function getReceiptFile(actor: SessionUser, receiptId: number): Promise<ReceiptFile> {
  authorize(actor, "receipt:read");
  const receipt = await getAccessibleReceipt(actor, receiptId);

  const file = await getStorage(receipt.storageProvider).get(receipt.storageKey);
  if (!file) throw new NotFoundError("Die Datei zum Beleg ist nicht mehr vorhanden.");

  return {
    file,
    fileName: receipt.fileName,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
  };
}

export function isOcrAvailable(): boolean {
  return getOcrService().isConfigured();
}

/**
 * Liest Datum, Rechnungsnummer, Lieferant und Betrag per OCR aus. Bereits
 * ausgefüllte Metadaten bleiben unangetastet – OCR ergänzt nur leere Felder.
 */
export async function runReceiptOcr(actor: SessionUser, receiptId: number): Promise<OcrFields> {
  authorizeGlobalWrite(actor, "receipt:ocr");
  const receipt = await getAccessibleReceipt(actor, receiptId);

  const ocr = getOcrService();
  if (!ocr.isConfigured()) throw new DomainError("OCR ist nicht eingerichtet.");
  if (!ocr.supports(receipt.mimeType)) {
    throw new DomainError("Dieses Dateiformat kann nicht per OCR ausgelesen werden.");
  }

  const file = await getStorage(receipt.storageProvider).get(receipt.storageKey);
  if (!file) throw new NotFoundError("Die Datei zum Beleg ist nicht mehr vorhanden.");
  const bytes = Buffer.from(await new Response(file.body).arrayBuffer());

  const db = getDb();
  await db.update(receipts).set({ ocrStatus: "pending" }).where(eq(receipts.id, receiptId));

  try {
    const result = await ocr.analyzeInvoice({ bytes, mimeType: receipt.mimeType });
    const { fields } = result;
    await db
      .update(receipts)
      .set({
        ocrStatus: "done",
        ocrResult: result,
        ocrProcessedAt: new Date(),
        documentDate: receipt.documentDate ?? fields.documentDate,
        supplier: receipt.supplier ?? fields.supplier,
        invoiceNumber: receipt.invoiceNumber ?? fields.invoiceNumber,
        amountCents: receipt.amountCents ?? fields.amountCents,
      })
      .where(eq(receipts.id, receiptId));
    return fields;
  } catch (error) {
    await db
      .update(receipts)
      .set({ ocrStatus: "failed", ocrProcessedAt: new Date() })
      .where(eq(receipts.id, receiptId));
    if (error instanceof OcrError) throw new DomainError(error.message);
    throw error;
  }
}
