const RESIZABLE = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 2400;

/**
 * Verkleinert Fotos im Browser, bis sie unter das Upload-Limit passen.
 * Handyfotos sind oft größer als das, was eine Vercel Function annimmt;
 * für einen lesbaren Beleg reichen 2400 px Kantenlänge aus.
 * PDFs und nicht dekodierbare Formate (z. B. HEIC) bleiben unverändert.
 */
export async function shrinkImage(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !RESIZABLE.includes(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (blob && blob.size <= maxBytes) {
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    scale *= 0.75;
  }
  return file;
}
