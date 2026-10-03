"use client";

import { use, useState } from "react";

import { Field, FieldErrorsContext } from "@/components/forms/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import {
  RECURRING_AMOUNT_TYPE_LABELS,
  RECURRING_INTERVAL_LABELS,
  RECURRING_INTERVALS,
} from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type {
  AllocationKeyDto,
  CategoryDto,
  RecurringAmountType,
  RecurringCostDto,
  UnitDto,
} from "@/types/billing";

interface RecurringFieldsProps {
  categories: CategoryDto[];
  allocationKeys: AllocationKeyDto[];
  units: UnitDto[];
  /** Vorhandene Vorlage beim Bearbeiten. */
  template?: RecurringCostDto;
}

/** Formularfelder einer Vorlage für wiederkehrende Kosten. */
export function RecurringFields({ categories, allocationKeys, units, template }: RecurringFieldsProps) {
  // Inaktive Einträge nur anbieten, wenn die Vorlage sie bereits verwendet.
  const categoryOptions = categories.filter((c) => c.isActive || c.id === template?.categoryId);
  const keyOptions = allocationKeys.filter((k) => k.isActive || k.id === template?.allocationKeyId);

  const initialCategory = template?.categoryId ?? categoryOptions[0]?.id;
  const defaultKeyOf = (categoryId: number | undefined) =>
    categories.find((c) => c.id === categoryId)?.defaultAllocationKeyId ?? keyOptions[0]?.id;

  const [keyId, setKeyId] = useState(template?.allocationKeyId ?? defaultKeyOf(initialCategory));
  // Sobald der Schlüssel von Hand gewählt wurde, überschreibt ihn die Kostenart nicht mehr.
  const [keyTouched, setKeyTouched] = useState(Boolean(template));
  const [amountType, setAmountType] = useState<RecurringAmountType>(template?.amountType ?? "fixed");
  const unitError = use(FieldErrorsContext).unitIds?.[0];

  return (
    <>
      <Field label="Kostenart" name="categoryId">
        <Select
          name="categoryId"
          defaultValue={initialCategory}
          onChange={(event) => {
            if (!keyTouched) setKeyId(defaultKeyOf(Number(event.target.value)));
          }}
          required
        >
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Beschreibung"
        name="description"
        hint="Der Zeitraum wird beim Erzeugen angehängt, z. B. „Hausbetreuung Jänner 2026“."
      >
        <Input name="description" defaultValue={template?.description} maxLength={160} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intervall" name="interval">
          <Select name="interval" defaultValue={template?.interval ?? "monthly"} required>
            {RECURRING_INTERVALS.map((interval) => (
              <option key={interval} value={interval}>
                {RECURRING_INTERVAL_LABELS[interval]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Betragstyp" name="amountType">
          <Select
            name="amountType"
            value={amountType}
            onChange={(event) => setAmountType(event.target.value as RecurringAmountType)}
            required
          >
            {(Object.keys(RECURRING_AMOUNT_TYPE_LABELS) as RecurringAmountType[]).map((type) => (
              <option key={type} value={type}>
                {RECURRING_AMOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Betrag je Zeitraum (€)"
          name="amount"
          optional={amountType === "variable"}
          hint={
            amountType === "fixed"
              ? "Brutto. Wird beim Erzeugen vorgeschlagen."
              : "Richtwert – der Betrag wird beim Erzeugen eingegeben."
          }
        >
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={centsToInput(template?.amountCents)}
            required={amountType === "fixed"}
          />
        </Field>
        <Field label="Rechnungssteller" name="supplier" optional>
          <Input name="supplier" defaultValue={template?.supplier ?? ""} maxLength={200} />
        </Field>
      </div>

      <Field
        label="Umlageschlüssel"
        name="allocationKeyId"
        hint="Bestimmt, in welchem Verhältnis der Betrag auf die TOPs verteilt wird."
      >
        <Select
          name="allocationKeyId"
          value={keyId}
          onChange={(event) => {
            setKeyId(Number(event.target.value));
            setKeyTouched(true);
          }}
          required
        >
          {keyOptions.map((key) => (
            <option key={key.id} value={key.id}>
              {key.name}
              {key.unitLabel ? ` (${key.unitLabel})` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">TOP-Zuordnung</legend>
        <div className="flex flex-wrap gap-2">
          {units.map((unit) => (
            <label
              key={unit.id}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-3 text-sm has-checked:border-primary has-checked:bg-primary-soft"
            >
              <Checkbox
                name="unitIds"
                value={unit.id}
                defaultChecked={template ? template.unitIds.includes(unit.id) : true}
              />
              {unit.name}
            </label>
          ))}
        </div>
        {unitError ? (
          <p role="alert" className="text-sm text-danger">
            {unitError}
          </p>
        ) : (
          <p className="text-xs text-subtle">Nur die ausgewählten TOPs tragen die erzeugten Kosten.</p>
        )}
      </fieldset>

      <Field label="Notiz" name="notes" optional>
        <Textarea name="notes" defaultValue={template?.notes ?? ""} rows={2} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isActive" defaultChecked={template?.isActive ?? true} />
        Aktiv – aus der Vorlage lassen sich Kosten erzeugen
      </label>
    </>
  );
}
