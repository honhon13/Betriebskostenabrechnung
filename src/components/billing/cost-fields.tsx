"use client";

import { useState } from "react";

import { Field } from "@/components/forms/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import type { AllocationKeyDto, CategoryDto, CostDto, UnitDto } from "@/types/billing";

interface CostFieldsProps {
  categories: CategoryDto[];
  allocationKeys: AllocationKeyDto[];
  units: UnitDto[];
  /** Vorhandene Kostenposition beim Bearbeiten. */
  cost?: CostDto;
}

/** Formularfelder einer Kostenposition: Kostenart, Betrag, Umlageschlüssel und TOP-Zuordnung. */
export function CostFields({ categories, allocationKeys, units, cost }: CostFieldsProps) {
  // Inaktive Einträge nur anbieten, wenn die Position sie bereits verwendet.
  const categoryOptions = categories.filter((c) => c.isActive || c.id === cost?.categoryId);
  const keyOptions = allocationKeys.filter((k) => k.isActive || k.id === cost?.allocationKeyId);

  const initialCategory = cost?.categoryId ?? categoryOptions[0]?.id;
  const defaultKeyOf = (categoryId: number | undefined) =>
    categories.find((c) => c.id === categoryId)?.defaultAllocationKeyId ?? keyOptions[0]?.id;

  const [keyId, setKeyId] = useState(cost?.allocationKeyId ?? defaultKeyOf(initialCategory));
  // Sobald der Schlüssel von Hand gewählt wurde, überschreibt ihn die Kostenart nicht mehr.
  const [keyTouched, setKeyTouched] = useState(Boolean(cost));

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

      <Field label="Beschreibung" name="description">
        <Input name="description" defaultValue={cost?.description} maxLength={200} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Betrag (€)" name="amount" hint="Gutschriften mit Minus, z. B. -50,00">
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={centsToInput(cost?.amountCents)}
            required
          />
        </Field>
        <Field label="Rechnungsdatum" name="costDate" optional>
          <Input name="costDate" type="date" defaultValue={cost?.costDate ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lieferant" name="supplier" optional>
          <Input name="supplier" defaultValue={cost?.supplier ?? ""} maxLength={200} />
        </Field>
        <Field label="Rechnungsnummer" name="invoiceNumber" optional>
          <Input name="invoiceNumber" defaultValue={cost?.invoiceNumber ?? ""} maxLength={100} />
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
                defaultChecked={cost ? cost.unitIds.includes(unit.id) : true}
              />
              {unit.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-subtle">
          Nur die ausgewählten TOPs tragen diese Kosten. Eine einzelne TOP = direkte Zuordnung.
        </p>
      </fieldset>

      <Field label="Notiz" name="notes" optional>
        <Textarea name="notes" defaultValue={cost?.notes ?? ""} rows={2} />
      </Field>
    </>
  );
}
