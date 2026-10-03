import { requireActor } from "@/auth/current-user";
import { apiErrorResponse } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { annualStatementFileName, renderAnnualStatement } from "@/lib/pdf/annual-statement";
import { getAnnualStatement } from "@/services/annual-statement.service";

/**
 * Jahresabrechnung als PDF. Wird bei jedem Abruf aus den gespeicherten, freigegebenen Daten
 * erzeugt – es gibt keine abgelegte Datei, die veralten könnte. `?top=2` liefert der
 * Verwaltung die Abrechnung einer einzelnen TOP, `?download` den Download statt der Anzeige.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/abrechnung/[jahr]/pdf">,
): Promise<Response> {
  try {
    const actor = await requireActor();
    const { jahr } = await context.params;
    if (!/^\d{4}$/.test(jahr)) throw new NotFoundError("Das Abrechnungsjahr wurde nicht gefunden.");

    const query = new URL(request.url).searchParams;
    const top = query.get("top");
    if (top !== null && !/^\d{1,3}$/.test(top)) throw new NotFoundError("Die TOP wurde nicht gefunden.");

    const data = await getAnnualStatement(actor, Number(jahr), top === null ? undefined : Number(top));
    const bytes = await renderAnnualStatement(data);
    const fileName = encodeURIComponent(annualStatementFileName(data));

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${query.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${fileName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
