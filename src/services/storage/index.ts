import "server-only";

import { LocalStorage } from "./local.storage";
import type { StorageService } from "./types";
import { VercelBlobStorage } from "./vercel-blob.storage";

export type { StorageService, StoredFile } from "./types";

const PROVIDERS: Record<string, () => StorageService> = {
  local: () => new LocalStorage(),
  "vercel-blob": () => new VercelBlobStorage(),
};

const instances = new Map<string, StorageService>();

/** Anbieter für neue Uploads: STORAGE_DRIVER, sonst Vercel Blob sobald ein Token da ist. */
export function getDefaultStorageProvider(): string {
  const configured = process.env.STORAGE_DRIVER?.trim();
  if (configured) return configured;
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
}

/**
 * Liefert die Ablage zu einem Anbieter. Bestehende Belege werden über den bei
 * ihnen gespeicherten Anbieter gelesen – ein Wechsel des Standards bricht sie nicht.
 */
export function getStorage(provider = getDefaultStorageProvider()): StorageService {
  const cached = instances.get(provider);
  if (cached) return cached;

  const factory = PROVIDERS[provider];
  if (!factory) throw new Error(`Unbekannter Storage-Anbieter: ${provider}`);

  const instance = factory();
  instances.set(provider, instance);
  return instance;
}

/** Auf Vercel gehen lokal abgelegte Dateien beim nächsten Deploy verloren. */
export function isStoragePersistent(): boolean {
  return !(process.env.VERCEL && getDefaultStorageProvider() === "local");
}
