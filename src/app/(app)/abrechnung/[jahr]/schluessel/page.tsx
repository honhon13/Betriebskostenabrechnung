import { Lock, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { resetAllocationValuesAction, saveAllocationValuesAction } from "@/app/actions/billing";
import { can, getDataScope } from "@/auth/rbac";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NoAccess } from "@/components/ui/no-access";
import { formatNumber } from "@/lib/format";
import { listAllocationValues } from "@/services/allocation.service";
import { listAllocationKeys, listUnits } from "@/services/masterdata.service";
import { loadPeriodPage } from "@/services/page-context";

export const metadata: Metadata = { title: "Umlageschlüssel" };

export default async function AllocationKeysPage({
  params,
}: PageProps<"/abrechnung/[jahr]/schluessel">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!getDataScope(user).allUnits) return <NoAccess />;

  const [keys, units, values] = await Promise.all([
    listAllocationKeys(),
    listUnits(user),
    listAllocationValues(user, period.id),
  ]);

  const editable = period.status === "draft" && can(user, "period:write");
  const valueOf = (keyId: number, unitId: number) =>
    values.find((v) => v.keyId === keyId && v.unitId === unitId)?.value ?? 0;
  // „Gleiche Teile“ braucht keine Werte; inaktive Schlüssel nur zeigen, wenn Werte existieren.
  const rows = keys.filter(
    (key) =>
      key.source !== "equal" && (key.isActive || units.some((u) => valueOf(key.id, u.id) !== 0)),
  );

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Schlüsselwerte je TOP für {period.year}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2.5 pr-3 font-medium">
              Schlüssel
            </th>
            {units.map((unit) => (
              <th key={unit.id} scope="col" className="px-2 py-2.5 text-right font-medium">
                {unit.name}
              </th>
            ))}
            <th scope="col" className="py-2.5 pl-3 text-right font-medium">
              Summe
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((key) => (
            <tr key={key.id}>
              <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                <span className="font-medium">{key.name}</span>
                {key.unitLabel ? <span className="text-muted"> ({key.unitLabel})</span> : null}
                {key.description ? (
                  <span className="block max-w-xs text-xs text-muted">{key.description}</span>
                ) : null}
              </th>
              {units.map((unit) => (
                <td key={unit.id} className="px-2 py-2 text-right tabular-nums">
                  {editable ? (
                    <Input
                      // Der key lässt das Feld neu entstehen, wenn sich der gespeicherte Wert
                      // ändert (z. B. nach „Aus Stammdaten übernehmen“).
                      key={valueOf(key.id, unit.id)}
                      name={`value:${key.id}:${unit.id}`}
                      aria-label={`${key.name} ${unit.name}`}
                      inputMode="decimal"
                      defaultValue={String(valueOf(key.id, unit.id)).replace(".", ",")}
                      className="ml-auto w-24 text-right"
                    />
                  ) : (
                    formatNumber(valueOf(key.id, unit.id), 3)
                  )}
                </td>
              ))}
              <td className="py-2.5 pl-3 text-right font-medium tabular-nums">
                {formatNumber(
                  units.reduce((acc, unit) => acc + valueOf(key.id, unit.id), 0),
                  3,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {period.status === "released" ? (
        <Alert tone="info" title="Diese Abrechnung ist freigegeben">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3.5" aria-hidden />
            Die Schlüsselwerte sind gesperrt. Nimm die Freigabe zurück, um sie zu ändern.
          </span>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={`Schlüsselwerte ${period.year}`}
          description="Nach diesen Werten werden die Kosten des Jahres auf die TOPs verteilt."
          action={
            editable ? (
              <ConfirmAction
                trigger={
                  <>
                    <RotateCcw aria-hidden />
                    Aus Stammdaten übernehmen
                  </>
                }
                triggerVariant="secondary"
                triggerSize="sm"
                title="Stammdaten übernehmen?"
                description="Wohnfläche und Personen werden mit den aktuellen Stammdaten der TOPs überschrieben. Verbrauchswerte bleiben unverändert."
                confirmLabel="Übernehmen"
                action={resetAllocationValuesAction.bind(null, period.id)}
              />
            ) : null
          }
        />
        <CardContent>
          {editable ? (
            <ActionForm
              action={saveAllocationValuesAction.bind(null, period.id)}
              submitLabel="Werte speichern"
              showSuccess
            >
              {table}
            </ActionForm>
          ) : (
            table
          )}
          <p className="mt-4 text-xs text-subtle">
            „Gleiche Teile“ braucht keine Werte: jede beteiligte TOP trägt denselben Anteil. Weitere
            Schlüssel (z. B. Heizverbrauch) legst du in den{" "}
            <Link href="/einstellungen/stammdaten" className="underline">
              Stammdaten
            </Link>{" "}
            an.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
