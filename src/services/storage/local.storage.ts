import "server-only";

import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import type { StorageService, StoredFile } from "./types";

/**
 * Dateisystem-Ablage für die lokale Entwicklung. Auf Vercel ist das Dateisystem
 * flüchtig – dort muss ein persistenter Anbieter (vercel-blob) verwendet werden.
 */
export class LocalStorage implements StorageService {
  readonly provider = "local";
  private readonly root: string;

  constructor(root = path.join(process.cwd(), ".data", "uploads")) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    // Schlüssel dürfen das Ablageverzeichnis nicht verlassen.
    if (!target.startsWith(this.root + path.sep)) throw new Error("Ungültiger Storage-Schlüssel.");
    return target;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, { flag: "wx" });
  }

  async get(key: string): Promise<StoredFile | null> {
    const target = this.resolve(key);
    try {
      const info = await stat(target);
      return {
        body: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>,
        contentType: null,
        size: info.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
