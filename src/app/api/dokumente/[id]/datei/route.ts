import { requireActor } from "@/auth/current-user";
import { apiErrorResponse } from "@/lib/api";
import { parseId } from "@/lib/validation";
import { getDocumentFile } from "@/services/documents.service";

/**
 * Liefert die Datei eines Dokuments aus der Datenbank. Es gibt keine öffentliche URL –
 * jeder Abruf läuft hier durch und wird gegen Sitzung, Rechte und Sichtbereich geprüft.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/dokumente/[id]/datei">,
): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const { bytes, fileName, mimeType } = await getDocumentFile(actor, parseId(id));

    const download = new URL(request.url).searchParams.has("download");
    const encodedName = encodeURIComponent(fileName);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.length),
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
