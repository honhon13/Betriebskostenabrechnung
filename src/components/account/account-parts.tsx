import { ChevronDown, CircleCheck, CircleMinus, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { inlineLinkClass } from "@/components/ui/interactive";
import { accountBalanceLabel } from "@/lib/billing/account";
import { formatCents, formatDate } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AccountMovement, AccountOverview, UnitAccount, UnitDto } from "@/types/billing";

/** Kontostand als Wort mit Symbol – nie nur als Farbe oder Vorzeichen. */
export function AccountBalanceBadge({ cents }: { cents: number }) {
  const label = accountBalanceLabel(cents);
  if (cents > 0) {
    return (
      <Badge tone="success" icon={<CircleCheck aria-hidden />}>
        {label}
      </Badge>
    );
  }
  if (cents < 0) {
    return (
      <Badge tone="warning" icon={<TriangleAlert aria-hidden />}>
        {label}
      </Badge>
    );
  }
  return <Badge icon={<CircleMinus aria-hidden />}>{label}</Badge>;
}

const cell = "px-2 py-2.5 text-right tabular-nums whitespace-nowrap";

/**
 * Konten im Überblick: je TOP Anfangssaldo, Einzahlungen, Auszahlungen und aktueller Saldo –
 * bei mehreren TOPs mit dem Gesamtbestand als Summe der Salden. Mit `unitHref` führt der Name
 * der TOP zu ihrem Kontoauszug.
 */
export function AccountSummaryTable({
  account,
  unitHref,
}: {
  account: AccountOverview;
  unitHref?: (unit: UnitAccount) => string;
}) {
  return (
    <div className="overflow-x-auto px-2 pt-2 pb-2 sm:px-3">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Abrechnungskonto je TOP</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Konto
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Anfangssaldo
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Einzahlungen
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Auszahlungen
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Aktueller Saldo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {account.units.map((unit) => (
            <tr key={unit.unitId}>
              <th scope="row" className="px-2 py-2.5 text-left font-medium whitespace-nowrap">
                {unitHref ? (
                  <Link href={unitHref(unit)} className={inlineLinkClass} title={`Konto ${unit.unitName} anzeigen`}>
                    {unit.unitName}
                  </Link>
                ) : (
                  unit.unitName
                )}
              </th>
              <td className={cell}>{formatCents(unit.openingCents)}</td>
              <td className={cell}>{formatCents(unit.inflowCents)}</td>
              <td className={cell}>{formatCents(unit.outflowCents)}</td>
              <td className={cell}>
                <span className="font-semibold">{formatCents(unit.balanceCents)}</span>
                <span className="mt-1 flex justify-end">
                  <AccountBalanceBadge cents={unit.balanceCents} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {account.units.length > 1 ? (
          <tfoot className="border-t-2 border-border-strong font-semibold">
            <tr>
              <th scope="row" className="px-2 py-2.5 text-left">
                Gesamtbestand
              </th>
              <td className={cell}>{formatCents(account.openingCents)}</td>
              <td className={cell}>{formatCents(account.inflowCents)}</td>
              <td className={cell}>{formatCents(account.outflowCents)}</td>
              <td className={cell}>{formatCents(account.balanceCents)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

interface UnitLedgerProps {
  unit: UnitAccount;
  startDate: string;
  defaultOpen?: boolean;
  /** Sprungziel, z. B. `konto-top-1`. */
  id?: string;
  /** Gefilterte Bewegungen – ohne Angabe alle. Salden und Summen bleiben die des ganzen Kontos. */
  movements?: AccountMovement[];
  /** Link von einer Bewegung zur Einzahlung in der Liste. */
  movementHref?: (movement: AccountMovement) => string;
}

/**
 * Konto einer TOP wie ein Kontoauszug: Anfangssaldo zum Stichtag, danach jede Bewegung in
 * zeitlicher Reihenfolge mit dem Saldo, der sich aus ihr ergibt.
 */
export function UnitLedger({
  unit,
  startDate,
  defaultOpen = false,
  id,
  movements = unit.movements,
  movementHref,
}: UnitLedgerProps) {
  const number = "px-3 py-2 text-right align-top tabular-nums whitespace-nowrap";
  const filtered = movements.length !== unit.movements.length;

  return (
    <details
      id={id}
      open={defaultOpen || undefined}
      className="group scroll-mt-20 rounded-xl border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-ring sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-24 items-center gap-2 text-base font-semibold">
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
          {unit.unitName}
        </span>
        <dl className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-muted">Anfangssaldo</dt>
            <dd className="font-medium tabular-nums">{formatCents(unit.openingCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Bewegungen</dt>
            <dd className="font-medium tabular-nums">
              {unit.movements.length} · {formatCents(unit.inflowCents - unit.outflowCents)}
            </dd>
          </div>
          <div className="ml-auto text-right">
            <dt className="text-xs text-muted">Aktueller Saldo</dt>
            <dd className="flex items-center gap-2 font-semibold tabular-nums">
              {formatCents(unit.balanceCents)}
              <AccountBalanceBadge cents={unit.balanceCents} />
            </dd>
          </div>
        </dl>
      </summary>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Kontobewegungen {unit.unitName}</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 pl-4 font-medium sm:pl-5">
                Datum
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Bewegung
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Einzahlung
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Auszahlung
              </th>
              <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium sm:pr-5">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="bg-surface-muted/60">
              <td className="py-2 pr-3 pl-4 align-top whitespace-nowrap tabular-nums sm:pl-5">
                {formatDate(startDate)}
              </td>
              <th scope="row" className="px-3 py-2 text-left align-top font-medium">
                Anfangssaldo zum Stichtag
                {unit.openingNote ? (
                  <span className="block text-xs font-normal text-muted">{unit.openingNote}</span>
                ) : null}
              </th>
              <td className={number} />
              <td className={number} />
              <td className={cn(number, "pr-4 font-medium sm:pr-5")}>{formatCents(unit.openingCents)}</td>
            </tr>
            {movements.map((movement) => {
              const label =
                movement.purpose ?? (movement.amountCents < 0 ? "Auszahlung" : "Einzahlung");
              return (
              <tr key={movement.id} className="hover:bg-surface-muted/50">
                <td className="py-2 pr-3 pl-4 align-top whitespace-nowrap tabular-nums sm:pl-5">
                  {formatDate(movement.date)}
                </td>
                <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                  {movementHref ? (
                    <Link href={movementHref(movement)} className={inlineLinkClass}>
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  <span className="block text-xs text-muted">Abrechnungsjahr {movement.year}</span>
                </th>
                <td className={number}>{movement.amountCents > 0 ? formatCents(movement.amountCents) : ""}</td>
                <td className={number}>{movement.amountCents < 0 ? formatCents(-movement.amountCents) : ""}</td>
                <td className={cn(number, "pr-4 font-medium sm:pr-5")}>{formatCents(movement.balanceCents)}</td>
              </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border-strong font-semibold">
            <tr>
              <th scope="row" colSpan={2} className="py-2 pr-3 pl-4 text-left sm:pl-5">
                Aktueller Saldo {unit.unitName}
              </th>
              <td className={number}>{formatCents(unit.inflowCents)}</td>
              <td className={number}>{formatCents(unit.outflowCents)}</td>
              <td className={cn(number, "pr-4 sm:pr-5")}>{formatCents(unit.balanceCents)}</td>
            </tr>
          </tfoot>
        </table>
        {unit.movements.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-sm text-muted sm:px-5">
            Seit dem Stichtag gibt es noch keine Ein- oder Auszahlungen.
          </p>
        ) : filtered ? (
          <p className="border-t border-border px-4 py-3 text-sm text-muted sm:px-5">
            {movements.length} von {unit.movements.length} Bewegungen in dieser Auswahl. Salden und
            Summen gelten für das ganze Konto.
          </p>
        ) : null}
      </div>
    </details>
  );
}

interface AccountOpeningFieldsProps {
  units: UnitDto[];
  /** Bisheriger Stand – leer beim ersten Einrichten. */
  account: AccountOverview;
  /** Vorschlag für den Stichtag beim ersten Einrichten. */
  suggestedStartDate: string;
}

/** Formularfelder: Stichtag und je TOP der Anfangssaldo mit optionaler Notiz. */
export function AccountOpeningFields({ units, account, suggestedStartDate }: AccountOpeningFieldsProps) {
  return (
    <>
      <Field
        label="Stichtag"
        name="startDate"
        hint="Beginn der laufenden Kontoführung. Ein- und Auszahlungen ab diesem Tag werden weitergeführt; alles davor steckt im Anfangssaldo."
      >
        <Input
          name="startDate"
          type="date"
          defaultValue={account.startDate ?? suggestedStartDate}
          required
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Anfangssaldo je TOP zum Stichtag</legend>
        <p className="text-xs text-subtle">
          Guthaben als positiver Betrag, Rückstand mit Minus, z. B. -250,00. Leer zählt als 0,00.
        </p>
        {units.map((unit) => {
          const current = account.units.find((entry) => entry.unitId === unit.id);
          return (
            <div key={unit.id} className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field label={`Anfangssaldo ${unit.name} (€)`} name={`amount:${unit.id}`}>
                <Input
                  name={`amount:${unit.id}`}
                  inputMode="decimal"
                  placeholder="0,00"
                  defaultValue={current ? centsToInput(current.openingCents) : ""}
                />
              </Field>
              <Field label={`Notiz ${unit.name}`} name={`note:${unit.id}`} optional>
                <Input name={`note:${unit.id}`} defaultValue={current?.openingNote ?? ""} maxLength={200} />
              </Field>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}
