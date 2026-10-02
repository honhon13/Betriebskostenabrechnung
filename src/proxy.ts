import { NextResponse, type NextRequest } from "next/server";

// Bewusst ohne Import aus src/auth/session.ts: der Proxy soll keine Datenbank laden.
const SESSION_COOKIE = "bk_session";
const PUBLIC_PATHS = ["/login"];

/**
 * Nur ein optimistischer Vorfilter anhand des Cookies – ohne Datenbankzugriff.
 * Die verbindliche Prüfung (Sitzung gültig, Benutzer aktiv, Rechte) passiert
 * serverseitig in src/auth und in jedem Service.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // API-Routen prüfen selbst und antworten mit 401 statt einer Umleitung.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp)$).*)"],
};
