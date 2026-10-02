import { CircleCheck, CircleMinus } from "lucide-react";
import type { Metadata } from "next";

import { requireUser } from "@/auth/current-user";
import { canAny } from "@/auth/rbac";
import { PasswordForm } from "@/components/auth/password-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isOcrAvailable } from "@/services/documents.service";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function AccountPage() {
  const user = await requireUser();
  const showSystem = canAny(user, ["masterdata:write", "user:manage"]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="self-start">
        <CardHeader title="Mein Konto" />
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Benutzername</dt>
            <dd className="font-medium">{user.username}</dd>
            <dt className="text-muted">Name</dt>
            <dd>{user.displayName}</dd>
            <dt className="text-muted">Rolle</dt>
            <dd>{user.roleName}</dd>
            <dt className="text-muted">Wohneinheit</dt>
            <dd>{user.unitName ?? "–"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Passwort ändern"
          description="Danach werden alle anderen Geräte abgemeldet."
        />
        <CardContent>
          <PasswordForm username={user.username} />
        </CardContent>
      </Card>

      {showSystem ? (
        <Card className="self-start lg:col-span-2">
          <CardHeader title="System" description="Konfiguration über Umgebungsvariablen." />
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Dokumenten-Speicher</dt>
              <dd className="flex flex-wrap items-center gap-2">
                Neon PostgreSQL (in der Datenbank)
                <Badge tone="success" icon={<CircleCheck aria-hidden />}>
                  Bereit
                </Badge>
              </dd>
              <dt className="text-muted">OCR</dt>
              <dd className="flex flex-wrap items-center gap-2">
                Azure Document Intelligence
                {isOcrAvailable() ? (
                  <Badge tone="success" icon={<CircleCheck aria-hidden />}>
                    Eingerichtet
                  </Badge>
                ) : (
                  <Badge icon={<CircleMinus aria-hidden />}>Nicht eingerichtet</Badge>
                )}
              </dd>
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
