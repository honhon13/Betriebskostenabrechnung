import { requireActor } from "@/auth/current-user";
import { apiErrorResponse } from "@/lib/api";
import { parseId } from "@/lib/validation";
import { getReceiptFile } from "@/services/receipts.service";

/**
 * Liefert die Datei eines Belegs. Dateien haben keine öffentliche URL – jeder Abruf
 * läuft hier durch und wird gegen Sitzung, Rechte und Sichtbereich geprüft.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/belege/[id]/datei">,
): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const { file, fileName, mimeType, sizeBytes } = await getReceiptFile(actor, parseId(id));

    const download = new URL(request.url).searchParams.has("download");
    const encodedName = encodeURIComponent(fileName);

    return new Response(file.body, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(file.size ?? sizeBytes),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`,
        // Der Typ wurde beim Upload am Inhalt geprüft – der Browser soll nicht raten.
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
