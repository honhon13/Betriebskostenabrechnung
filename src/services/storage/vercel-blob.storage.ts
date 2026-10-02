import "server-only";

import { del, get, put } from "@vercel/blob";

import type { StorageService, StoredFile } from "./types";

/**
 * Vercel Blob mit privatem Zugriff: Dateien sind nicht per URL abrufbar, sondern
 * nur über die App, die vorher die Berechtigung prüft. Benötigt einen privaten
 * Blob-Store und BLOB_READ_WRITE_TOKEN (setzt Vercel beim Verbinden automatisch).
 */
export class VercelBlobStorage implements StorageService {
  readonly provider = "vercel-blob";

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await put(key, body, { access: "private", contentType, addRandomSuffix: false });
  }

  async get(key: string): Promise<StoredFile | null> {
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: result.blob.contentType, size: result.blob.size };
  }

  async delete(key: string): Promise<void> {
    await del(key);
  }
}
