import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import {
  createAllocationKeyAction,
  createCategoryAction,
  deleteAllocationKeyAction,
  deleteCategoryAction,
  updateAllocationKeyAction,
  updateCategoryAction,
  updateUnitAction,
} from "@/app/actions/settings";
import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSelect } from "@/components/filters/filter-controls";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { NoAccess } from "@/components/ui/no-access";
import { countActive, readMapped, readParam } from "@/lib/filters";
import { formatNumber } from "@/lib/format";
import { filterMasterData } from "@/lib/list-filters";
import { listAllocationKeys, listCategories, listUnits } from "@/services/masterdata.service";
import type { AllocationKeyDto, AllocationSource, CategoryDto, UnitDto } from "@/types/billing";

export const metadata: Metadata = { title: "Stammdaten" };

const SOURCE_LABEL: Record<AllocationSource, string> = {
  unit_area: "aus Wohnfläche der TOP",
  unit_persons: "aus Personen der TOP",
  equal: "gleiche Teile",
  manual: "Eingabe je Abrechnungsjahr",
};

function ActiveCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox name="isActive" defaultChecked={defaultChecked} />
      Aktiv – bei neuen Kosten auswählbar
    </label>
  );
}

function CategoryFields({ category, keys }: { category?: CategoryDto; keys: AllocationKeyDto[] }) {
  return (
    <>
      <Field label="Name" name="name">
        <Input name="name" defaultValue={category?.name} maxLength={80} required />
      </Field>
      <Field label="Standard-Umlageschlüssel" name="defaultAllocationKeyId" optional>
        <Select name="defaultAllocationKeyId" defaultValue={category?.defaultAllocationKeyId ?? ""}>
          <option value="">Kein Standard</option>
          {keys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Beschreibung" name="description" optional>
        <Textarea name="description" defaultValue={category?.description ?? ""} rows={2} />
      </Field>
      <ActiveCheckbox defaultChecked={category?.isActive ?? true} />
    </>
  );
}

function KeyFields({ allocationKey }: { allocationKey?: AllocationKeyDto }) {
  return (
    <>
      <Field label="Name" name="name">
        <Input name="name" defaultValue={allocationKey?.name} maxLength={80} required />
      </Field>
      <Field label="Einheit" name="unitLabel" optional hint="z. B. m³, kWh, Einh.">
        <Input name="unitLabel" defaultValue={allocationKey?.unitLabel} maxLength={20} />
      </Field>
      <Field label="Beschreibung" name="description" optional>
        <Textarea name="description" defaultValue={allocationKey?.description ?? ""} rows={2} />
      </Field>
      <ActiveCheckbox defaultChecked={allocationKey?.isActive ?? true} />
    </>
  );
}

/** Aktiv oder inaktiv in der URL (?status=inaktiv). */
const ACTIVE_PARAMS = { active: "aktiv", inactive: "inaktiv" } as const;

export default async function MasterDataPage({
  searchParams,
}: PageProps<"/einstellungen/stammdaten">) {
  const user = await requireUser();
  if (!can(user, "masterdata:write")) return <NoAccess />;

  const [units, categories, keys] = await Promise.all([
    listUnits(user),
    listCategories(),
    listAllocationKeys(),
  ]);
  const keyName = new Map(keys.map((key) => [key.id, key.name]));
  const inactive = <Badge>Inaktiv</Badge>;

  // Ein Filter für alle drei Listen. Den Aktiv-Schalter haben nur Kostenarten und Umlageschlüssel –
  // die Wohneinheiten filtert allein der Suchtext.
  const query = await searchParams;
  const search = readParam(query, "q");
  const activeParam = readMapped(query, "status", ACTIVE_PARAMS);
  const filter = { search, active: activeParam && activeParam === "active" };
  const activeFilters = countActive([search, activeParam]);
  const shownUnits = filterMasterData(units, { search });
  const shownCategories = filterMasterData(categories, filter);
  const shownKeys = filterMasterData(keys, filter);
  const noMatch = (
    <p className="px-4 py-6 text-center text-sm text-muted sm:px-5">
      Keine Treffer für diese Suche bzw. Filter.
    </p>
  );

  const unitColumns: Column<UnitDto>[] = [
    { key: "name", header: "Wohneinheit", mobile: false, cell: (u) => <span className="font-medium">{u.name}</span> },
    {
      key: "area",
      header: "Wohnfläche",
      align: "right",
      cell: (u) =>
        u.areaSqm === null ? <span className="text-warning">fehlt</span> : `${formatNumber(u.areaSqm)} m²`,
    },
    {
      key: "persons",
      header: "Personen",
      align: "right",
      cell: (u) => (u.persons === null ? <span className="text-warning">fehlt</span> : u.persons),
    },
    { key: "notes", header: "Notiz", cell: (u) => u.notes ?? <span className="text-subtle">–</span> },
  ];

  const categoryColumns: Column<CategoryDto>[] = [
    {
      key: "name",
      header: "Kostenart",
      mobile: false,
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {c.name}
          {c.isActive ? null : inactive}
        </span>
      ),
    },
    {
      key: "key",
      header: "Standard-Schlüssel",
      cell: (c) =>
        c.defaultAllocationKeyId ? keyName.get(c.defaultAllocationKeyId) : <span className="text-subtle">–</span>,
    },
  ];

  const keyColumns: Column<AllocationKeyDto>[] = [
    {
      key: "name",
      header: "Umlageschlüssel",
      mobile: false,
      cell: (k) => (
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {k.name}
          {k.isActive ? null : inactive}
        </span>
      ),
    },
    { key: "unit", header: "Einheit", cell: (k) => k.unitLabel || <span className="text-subtle">–</span> },
    { key: "source", header: "Werte", cell: (k) => SOURCE_LABEL[k.source] },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <FilterBar
          action="/einstellungen/stammdaten"
          activeCount={activeFilters}
          className="border-b-0"
          search={{ value: search ?? "", placeholder: "Name, Beschreibung …" }}
        >
          <FilterSelect
            name="status"
            label="Status"
            value={activeParam && ACTIVE_PARAMS[activeParam]}
            allLabel="Aktiv und inaktiv"
            options={[
              { value: ACTIVE_PARAMS.active, label: "Aktiv" },
              { value: ACTIVE_PARAMS.inactive, label: "Inaktiv" },
            ]}
          />
        </FilterBar>
      </Card>

      <Card>
        <CardHeader
          title="Wohneinheiten"
          description="Wohnfläche und Personen sind die Vorbelegung für neue Abrechnungsjahre."
        />
        <div className="pt-3">
          {shownUnits.length === 0 ? noMatch : null}
          <DataTable
            caption="Wohneinheiten"
            rows={shownUnits}
            columns={unitColumns}
            rowKey={(unit) => unit.id}
            mobileTitle={(unit) => unit.name}
            actions={(unit) => (
              <FormDialog
                trigger={<Pencil aria-hidden />}
                triggerVariant="ghost"
                triggerSize="icon"
                triggerLabel={`${unit.name} bearbeiten`}
                title={`${unit.name} bearbeiten`}
                description="Bestehende Abrechnungsjahre ändern sich erst, wenn du dort „Aus Stammdaten übernehmen“ wählst."
                action={updateUnitAction.bind(null, unit.id)}
              >
                <Field label="Name" name="name">
                  <Input name="name" defaultValue={unit.name} maxLength={60} required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Wohnfläche (m²)" name="areaSqm" optional>
                    <Input
                      name="areaSqm"
                      inputMode="decimal"
                      defaultValue={unit.areaSqm === null ? "" : String(unit.areaSqm).replace(".", ",")}
                    />
                  </Field>
                  <Field label="Personen" name="persons" optional>
                    <Input
                      name="persons"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      defaultValue={unit.persons ?? ""}
                    />
                  </Field>
                </div>
                <Field label="Notiz" name="notes" optional>
                  <Textarea name="notes" defaultValue={unit.notes ?? ""} rows={2} />
                </Field>
              </FormDialog>
            )}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Kostenarten"
          description="Kategorien für Kostenpositionen mit ihrem üblichen Umlageschlüssel."
          action={
            <FormDialog
              trigger={
                <>
                  <Plus aria-hidden />
                  Kostenart
                </>
              }
              triggerSize="sm"
              title="Kostenart anlegen"
              action={createCategoryAction}
              submitLabel="Anlegen"
            >
              <CategoryFields keys={keys} />
            </FormDialog>
          }
        />
        <div className="pt-3">
          {shownCategories.length === 0 ? noMatch : null}
          <DataTable
            caption="Kostenarten"
            rows={shownCategories}
            columns={categoryColumns}
            rowKey={(category) => category.id}
            mobileTitle={(category) => (
              <span className="flex flex-wrap items-center gap-2">
                {category.name}
                {category.isActive ? null : inactive}
              </span>
            )}
            actions={(category) => (
              <>
                <FormDialog
                  trigger={<Pencil aria-hidden />}
                  triggerVariant="ghost"
                  triggerSize="icon"
                  triggerLabel={`${category.name} bearbeiten`}
                  title="Kostenart bearbeiten"
                  action={updateCategoryAction.bind(null, category.id)}
                >
                  <CategoryFields category={category} keys={keys} />
                </FormDialog>
                <ConfirmAction
                  trigger={<Trash2 aria-hidden />}
                  triggerLabel={`${category.name} löschen`}
                  title="Kostenart löschen?"
                  description={<>„{category.name}“ wird gelöscht. Das geht nur, solange keine Kosten sie verwenden.</>}
                  confirmLabel="Löschen"
                  destructive
                  action={deleteCategoryAction.bind(null, category.id)}
                />
              </>
            )}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Umlageschlüssel"
          description="Eigene Schlüssel (z. B. Heizverbrauch) bekommen ihre Werte je Abrechnungsjahr."
          action={
            <FormDialog
              trigger={
                <>
                  <Plus aria-hidden />
                  Schlüssel
                </>
              }
              triggerSize="sm"
              title="Umlageschlüssel anlegen"
              action={createAllocationKeyAction}
              submitLabel="Anlegen"
            >
              <KeyFields />
            </FormDialog>
          }
        />
        <div className="pt-3">
          {shownKeys.length === 0 ? noMatch : null}
          <DataTable
            caption="Umlageschlüssel"
            rows={shownKeys}
            columns={keyColumns}
            rowKey={(key) => key.id}
            mobileTitle={(key) => (
              <span className="flex flex-wrap items-center gap-2">
                {key.name}
                {key.isActive ? null : inactive}
              </span>
            )}
            actions={(key) => (
              <>
                <FormDialog
                  trigger={<Pencil aria-hidden />}
                  triggerVariant="ghost"
                  triggerSize="icon"
                  triggerLabel={`${key.name} bearbeiten`}
                  title="Umlageschlüssel bearbeiten"
                  action={updateAllocationKeyAction.bind(null, key.id)}
                >
                  <KeyFields allocationKey={key} />
                </FormDialog>
                {key.isSystem ? null : (
                  <ConfirmAction
                    trigger={<Trash2 aria-hidden />}
                    triggerLabel={`${key.name} löschen`}
                    title="Umlageschlüssel löschen?"
                    description={<>„{key.name}“ wird samt seinen Werten gelöscht. Das geht nur, solange keine Kosten ihn verwenden.</>}
                    confirmLabel="Löschen"
                    destructive
                    action={deleteAllocationKeyAction.bind(null, key.id)}
                  />
                )}
              </>
            )}
          />
        </div>
      </Card>
    </div>
  );
}
