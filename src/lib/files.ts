/**
 * Vercel begrenzt Request-Bodies von Functions auf 4,5 MB. Größere Fotos werden
 * vor dem Upload im Browser verkleinert (siehe components/receipts/upload).
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_FILE_TYPES: Record<string, { extension: string; label: string }> = {
  "application/pdf": { extension: "pdf", label: "PDF" },
  "image/jpeg": { extension: "jpg", label: "JPEG" },
  "image/png": { extension: "png", label: "PNG" },
  "image/webp": { extension: "webp", label: "WebP" },
  "image/heic": { extension: "heic", label: "HEIC" },
  "image/tiff": { extension: "tiff", label: "TIFF" },
};

export const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * Erkennt den Dateityp am Inhalt statt an Endung oder Angabe des Browsers.
 * Liefert null für alles, was nicht in ALLOWED_FILE_TYPES steht – insbesondere
 * HTML oder SVG, die beim Anzeigen im Browser Skripte ausführen könnten.
 */
export function detectFileType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return "image/tiff";
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

/** Dateiname für Anzeige und Download: ohne Pfadanteile und Steuerzeichen. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .trim();
  return (cleaned || "beleg").slice(0, 150);
}
