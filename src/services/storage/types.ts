export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  size: number | null;
}

/**
 * Ablage für Belegdateien. In der Datenbank steht nur `provider` + `key`;
 * ein weiterer Anbieter (S3, Azure Blob …) ist eine neue Klasse mit diesem Interface
 * plus ein Eintrag in src/services/storage/index.ts.
 */
export interface StorageService {
  /** Wird mit dem Beleg gespeichert, damit Dateien später ihrem Anbieter zugeordnet werden. */
  readonly provider: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** null, wenn die Datei nicht (mehr) existiert. */
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}
