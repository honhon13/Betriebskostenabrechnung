import "server-only";

import type { UploadedFile } from "@/services/documents.service";

/**
 * Liest eine optionale Datei aus einem Formular. Ein leeres Dateifeld schickt der
 * Browser als Datei ohne Inhalt – das zählt als „keine Datei“. (Der Name ist dabei
 * nicht verlässlich leer: über eine Server Action kommt er z. B. als „blob“ an.)
 */
export async function readUpload(formData: FormData, name = "file"): Promise<UploadedFile | null> {
  const entry = formData.get(name);
  if (!(entry instanceof File) || entry.size === 0) return null;
  return { name: entry.name, bytes: Buffer.from(await entry.arrayBuffer()) };
}
