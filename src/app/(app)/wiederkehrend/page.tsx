import { CopyPlus, Pencil, Plus, Repeat, Send, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import {
  createRecurringCostAction,
  deleteRecurringCostAction,
  generateRecurringCostsAction,
  updateRecurringCostAction,
} from "@/app/actions/recurring";
import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSelect } from "@/components/filters/filter-controls";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { RecurringFields } from "@/components/recurring/recurring-fields";
import { RecurringGenerateFields } from "@/components/recurring/recurring-generate-fields";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { slotsPerYear } from "@/lib/billing/recurring";
import { countActive, readMapped, readNumber, readParam } from "@/lib/filters";
import { formatCents } from "@/lib/format";
import { RECURRING_INTERVAL_LABELS, RECURRING_INTERVALS } from "@/lib/labels";
import { filterRecurring, type RecurringListFilter } from "@/lib/list-filters";
import { listAllocationKeys, listCategories, listUnits } from "@/services/masterdata.service";
import { listPeriods, listSubmittablePeriods, pickDefaultPeriod } from "@/services/periods.service";
import { listRecurringCosts } from "@/services/recurring.service";
import type { RecurringCostDto, RecurringInterval } from "@/types/billing";

export const metadata: Metadata = { title: "Wiederkehrende Kosten" };

const PER: Record<RecurringInterval, string> = {
  monthly: "je Monat",
  quarterly: "je Quartal",
  yearly: "je Jahr",
};

/** Intervall in der URL (?intervall=monatlich). */
const INTERVAL_PARAMS: Record<RecurringInterval, string> = {
  monthly: "monatlich",
  quarterly: "quartalsweise",
  yearly: "jaehrlich",
};

/** Aktiv oder inaktiv in der URL (?status=inaktiv). */
const ACTIVE_PARAMS = { active: "aktiv", inactive: "inaktiv" } as const;

/**
 * Vorlagen für wiederkehrende Kosten. Die Verwaltung pflegt sie und erzeugt daraus
 * Kostenpositionen; Benutzer mit Einreich-Recht verwenden sie, um Kosten einzureichen.
 */
export default async function RecurringCostsPage({ searchParams }: PageProps<"/wiederkehrend">) {
  const user = await requireUser();
  if (!can(user, "recurring:read")) return <NoAccess />;

  const manages = getDataScope(user).allUnits;
  // Verbindlich prüft der Service – hier geht es nur darum, was angeboten wird.
  const direct = manages && can(user, "cost:write");
  const submits = !direct && can(user, "cost:submit");
  const canWrite = manages && can(user, "recurring:write");
  const canDelete = manages && can(user, "recurring:delete");

  const [allTemplates, categories, allocationKeys, units, periods] = await Promise.all([
    listRecurringCosts(user),
    canWrite ? listCategories() : [],
    canWrite ? listAllocationKeys() : [],
    listUnits(user),
    direct ? listPeriods(user) : submits ? listSubmittablePeriods(user) : [],
  ]);
  // Kosten lassen sich nur in Jahren anlegen, deren Abrechnung noch nicht freigegeben ist.
  const drafts = periods.filter((period) => period.status === "draft");
  const target = pickDefaultPeriod(drafts);
  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));

  // Filter liegen in der URL. Zur Auswahl stehen die Kostenarten, die in Vorlagen vorkommen.
  const query = await searchParams;
  const usedCategories = [
    ...new Map(allTemplates.map((t) => [t.categoryId, t.categoryName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "de"));
  const activeParam = readMapped(query, "status", ACTIVE_PARAMS);
  const filter: RecurringListFilter = {
    search: readParam(query, "q"),
    categoryId: usedCategories.find(([id]) => id === readNumber(query, "kostenart"))?.[0],
    interval: readMapped(query, "intervall", INTERVAL_PARAMS),
    // USER sehen ohnehin nur aktive Vorlagen.
    active: !manages || activeParam === undefined ? undefined : activeParam === "active",
    // Die TOP-Zuordnung sieht nur die Verwaltung.
    unitId: manages ? units.find((u) => String(u.number) === readParam(query, "top"))?.id : undefined,
  };
  const activeFilters = countActive(Object.values(filter));
  const templates = filterRecurring(allTemplates, filter);

  const title = (template: RecurringCostDto) => (
    <>
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {template.description}
        {template.isActive ? null : <Badge>Inaktiv</Badge>}
      </span>
      <span className="block text-xs font-normal text-muted">
        {[template.categoryName, template.supplier].filter(Boolean).join(" · ")}
      </span>
    </>
  );

  const columns: Column<RecurringCostDto>[] = [
    { key: "template", header: "Vorlage", mobile: false, cell: title },
    {
      key: "interval",
      header: "Intervall",
      cell: (template) => RECURRING_INTERVAL_LABELS[template.interval],
    },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      cell: (template) => (
        <>
          <span className="font-medium">
            {template.amountCents === null ? "variabel" : formatCents(template.amountCents)}
          </span>
          <span className="block text-xs text-muted">
            {template.amountType === "variable" && template.amountCents !== null
              ? `Richtwert ${PER[template.interval]}`
              : PER[template.interval]}
          </span>
        </>
      ),
    },
    { key: "key", header: "Umlageschlüssel", cell: (template) => template.allocationKeyName },
    ...(manages
      ? [
          {
            key: "units",
            header: "TOPs",
            cell: (template: RecurringCostDto) =>
              template.unitIds.length === units.length ? (
                "Alle"
              ) : (
                <span className="inline-flex flex-wrap justify-end gap-1 md:justify-start">
                  {template.unitIds.map((id) => (
                    <Badge key={id}>{unitName.get(id)}</Badge>
                  ))}
                </span>
              ),
          },
        ]
      : []),
    ...(target
      ? [
          {
            key: "generated",
            header: `Erzeugt ${target.year}`,
            cell: (template: RecurringCostDto) =>
              `${template.generated[target.id]?.length ?? 0} von ${slotsPerYear(template.interval)}`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Wiederkehrende Kosten"
        description={
          manages
            ? "Vorlagen für Kosten, die sich monatlich, quartalsweise oder jährlich wiederholen."
            : "Vorlagen der Verwaltung, die deine TOP betreffen – zum Einreichen wiederkehrender Kosten."
        }
      />

      {(direct || submits) && allTemplates.length > 0 && !target ? (
        <Alert tone="info" title="Derzeit ist kein Abrechnungsjahr offen">
          Kosten lassen sich nur in Jahren im Entwurf {direct ? "erzeugen" : "einreichen"}.
          {direct ? " Lege ein neues Jahr an oder nimm eine Freigabe zurück." : ""}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Vorlagen"
          description={
            `${templates.length} ${templates.length === 1 ? "Vorlage" : "Vorlagen"}${activeFilters > 0 ? ` von ${allTemplates.length}` : ""}. ` +
            "Erzeugte Kostenpositionen sind eigenständig und bleiben von späteren Änderungen der Vorlage unberührt."
          }
          action={
            canWrite ? (
              <FormDialog
                trigger={
                  <>
                    <Plus aria-hidden />
                    Vorlage
                  </>
                }
                triggerSize="sm"
                title="Vorlage anlegen"
                description="Kostenart, Betrag, Intervall, Umlageschlüssel und TOP-Zuordnung für wiederkehrende Kosten."
                action={createRecurringCostAction}
                submitLabel="Anlegen"
              >
                <RecurringFields categories={categories} allocationKeys={allocationKeys} units={units} />
              </FormDialog>
            ) : null
          }
        />
        {allTemplates.length > 0 ? (
          <FilterBar
            action="/wiederkehrend"
            activeCount={activeFilters}
            search={{ value: filter.search ?? "", placeholder: "Beschreibung, Rechnungssteller …" }}
          >
            <FilterSelect
              name="kostenart"
              label="Kostenart"
              value={filter.categoryId}
              allLabel="Alle Kostenarten"
              options={usedCategories.map(([id, name]) => ({ value: id, label: name }))}
            />
            <FilterSelect
              name="intervall"
              label="Intervall"
              value={filter.interval && INTERVAL_PARAMS[filter.interval]}
              allLabel="Alle Intervalle"
              options={RECURRING_INTERVALS.map((interval) => ({
                value: INTERVAL_PARAMS[interval],
                label: RECURRING_INTERVAL_LABELS[interval],
              }))}
            />
            {manages ? (
              <>
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
                <FilterSelect
                  name="top"
                  label="TOP"
                  value={units.find((u) => u.id === filter.unitId)?.number}
                  allLabel="Alle TOPs"
                  options={units.map((u) => ({ value: u.number, label: u.name }))}
                />
              </>
            ) : null}
          </FilterBar>
        ) : null}
        {templates.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title={activeFilters > 0 ? "Keine Treffer" : "Noch keine Vorlagen"}
            description={
              activeFilters > 0
                ? "Für diese Suche bzw. Filter gibt es keine Vorlagen."
                : canWrite
                  ? "Lege über „Vorlage“ an, was regelmäßig anfällt – etwa Hausbetreuung, Müllgebühr oder Versicherung."
                  : "Sobald die Verwaltung Vorlagen anlegt, die deine TOP betreffen, erscheinen sie hier."
            }
          />
        ) : (
          <div className="pt-3">
            <DataTable
              caption="Vorlagen für wiederkehrende Kosten"
              rows={templates}
              columns={columns}
              rowKey={(template) => template.id}
              mobileTitle={title}
              actions={(template) => (
                <>
                  {(direct || submits) && target && template.isActive ? (
                    <FormDialog
                      trigger={direct ? <CopyPlus aria-hidden /> : <Send aria-hidden />}
                      triggerVariant="ghost"
                      triggerSize="icon"
                      triggerLabel={
                        direct
                          ? `Kostenpositionen aus ${template.description} erzeugen`
                          : `Kosten aus ${template.description} einreichen`
                      }
                      title={direct ? "Kostenpositionen erzeugen" : "Kosten einreichen"}
                      description={`${template.description} · ${template.categoryName} · ${RECURRING_INTERVAL_LABELS[template.interval]}`}
                      action={generateRecurringCostsAction.bind(null, template.id)}
                      submitLabel={direct ? "Erzeugen" : "Einreichen"}
                    >
                      <RecurringGenerateFields
                        template={template}
                        periods={drafts.map((period) => ({ id: period.id, year: period.year }))}
                        defaultPeriodId={target.id}
                        submission={!direct}
                      />
                    </FormDialog>
                  ) : null}
                  {canWrite ? (
                    <FormDialog
                      trigger={<Pencil aria-hidden />}
                      triggerVariant="ghost"
                      triggerSize="icon"
                      triggerLabel={`Vorlage ${template.description} bearbeiten`}
                      title="Vorlage bearbeiten"
                      description="Änderungen gelten für künftig erzeugte Kostenpositionen – bestehende bleiben unverändert."
                      action={updateRecurringCostAction.bind(null, template.id)}
                    >
                      <RecurringFields
                        categories={categories}
                        allocationKeys={allocationKeys}
                        units={units}
                        template={template}
                      />
                    </FormDialog>
                  ) : null}
                  {canDelete ? (
                    <ConfirmAction
                      trigger={<Trash2 aria-hidden />}
                      triggerLabel={`Vorlage ${template.description} löschen`}
                      title="Vorlage löschen?"
                      description={
                        <>
                          „{template.description}“ wird gelöscht. Bereits erzeugte Kostenpositionen
                          bleiben erhalten.
                        </>
                      }
                      confirmLabel="Löschen"
                      destructive
                      action={deleteRecurringCostAction.bind(null, template.id)}
                    />
                  ) : null}
                </>
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
