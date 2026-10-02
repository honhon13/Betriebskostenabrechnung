import "server-only";

import { AzureDocumentIntelligenceOcrService } from "./azure-document-intelligence";
import type { OCRService } from "./types";

export { OcrError } from "./types";
export type { OCRService, OcrDocument, OcrResult } from "./types";

let instance: OCRService | undefined;

/** Der aktive OCR-Anbieter. Ob er nutzbar ist, sagt `isConfigured()`. */
export function getOcrService(): OCRService {
  instance ??= new AzureDocumentIntelligenceOcrService();
  return instance;
}
