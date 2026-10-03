"use client";

import { use, useState } from "react";

import { Field, FieldErrorsContext } from "@/components/forms/field";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { recurringDescription, recurringSlots } from "@/lib/billing/recurring";
import { centsToInput } from "@/lib/money";
import type { RecurringCostDto } from "@/types/billing";

interface RecurringGenerateFieldsProps {
  template: Pick<
    RecurringCostDto,
    "description" | "interval" | "amountType" | "amountCents" | "generated"
  >;
  /** Abrechnungsjahre im Entwurf, in denen sich Kosten anlegen bzw. einreichen lassen. */
  periods: { id: number; year: number }[];
  defaultPeriodId: number;
  /** Einreichen durch Benutzer: die Positionen warten danach auf Prüfung. */
  submission: boolean;
}

/**
 * Kostenpositionen aus einer Vorlage erzeugen: Abrechnungsjahr wählen, Zeiträume anhaken,
 * Betrag bestätigen. Zeiträume, für die es schon eine Position aus der Vorlage gibt, sind
 * abgehakt und gesperrt.
 */
export function RecurringGenerateFields({
  template,
  periods,
  defaultPeriodId,
  submission,
}: RecurringGenerateFieldsProps) {
  const slotError = use(FieldErrorsContext).slots?.[0];
  const [periodId, setPeriodId] = useState(defaultPeriodId);
  const period = periods.find((entry) => entry.id === periodId) ?? periods[0];
  const slots = recurringSlots(template.interval, period.year);
  const taken = new Set(template.generated[period.id] ?? []);
  const open = slots.filter((slot) => !taken.has(slot.start));

  // Vorauswahl: bei einem einzelnen offenen Zeitraum dieser, sonst wählt man selbst.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(open.length === 1 ? [open[0].index] : []),
  );
  const chosen = open.filter((slot) => selected.has(slot.index));

  const toggle = (index: number, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });

  return (
    <>
      <Field label="Abrechnungsjahr" name="periodId">
        <Select
          name="periodId"
          value={period.id}
          onChange={(event) => {
            setPeriodId(Number(event.target.value));
            setSelected(new Set());
          }}
          required
        >
          {periods.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.year}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium">
          {template.interval === "yearly" ? "Zeitraum" : "Zeiträume"}
          {open.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                setSelected(
                  chosen.length === open.length ? new Set() : new Set(open.map((slot) => slot.index)),
                )
              }
              className="rounded text-xs font-normal text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {chosen.length === open.length ? "Auswahl aufheben" : "Alle offenen auswählen"}
            </button>
          ) : null}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((slot) => {
            const done = taken.has(slot.start);
            return (
              <label
                key={slot.index}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary-soft has-disabled:cursor-not-allowed has-disabled:border-border has-disabled:bg-surface-muted has-disabled:text-muted"
              >
                <Checkbox
                  name="slots"
                  value={slot.index}
                  checked={done || selected.has(slot.index)}
                  disabled={done}
                  onChange={(event) => toggle(slot.index, event.target.checked)}
                />
                <span>
                  {slot.label}
                  {done ? <span className="block text-xs">bereits erzeugt</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        {open.length === 0 ? (
          <p className="text-xs text-subtle">
            Für {period.year} gibt es aus dieser Vorlage bereits alle Kostenpositionen.
          </p>
        ) : slotError ? (
          <p role="alert" className="text-sm text-danger">
            {slotError}
          </p>
        ) : null}
      </fieldset>

      <Field
        label={`Betrag ${template.interval === "yearly" ? "" : "je Zeitraum "}(€)`}
        name="amount"
        hint={
          template.amountType === "fixed"
            ? "Brutto. Fixbetrag der Vorlage – für diese Erzeugung änderbar."
            : "Brutto. Variabler Betrag – bitte laut Rechnung eintragen."
        }
      >
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={centsToInput(template.amountCents)}
          required
        />
      </Field>

      {chosen.length > 0 ? (
        <Alert
          tone="info"
          title={
            chosen.length === 1
              ? `Es entsteht 1 Kostenposition: „${recurringDescription(template.description, chosen[0])}“`
              : `Es entstehen ${chosen.length} Kostenpositionen, z. B. „${recurringDescription(template.description, chosen[0])}“`
          }
        >
          {submission
            ? "Sie werden zur Prüfung eingereicht und zählen erst nach der Freigabe durch die Verwaltung."
            : "Kostenart, Umlageschlüssel und TOP-Zuordnung kommen aus der Vorlage. Jede Position lässt sich danach unter „Kosten“ einzeln ändern – unabhängig von der Vorlage."}
        </Alert>
      ) : null}
    </>
  );
}
