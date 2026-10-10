import { ArrowDownLeft, ArrowUpRight, Flag, Landmark, Scale, Settings2 } from "lucide-react";
import type { Metadata } from "next";

import { saveAccountOpeningAction } from "@/app/actions/account";
import { requireUser } from "@/auth/current-user";
import { can, getDataScope } from "@/auth/rbac";
import {
  AccountBalanceBadge,
  AccountOpeningFields,
  AccountSummaryTable,
  UnitLedger,
} from "@/components/account/account-parts";
import { AddButton } from "@/components/add/add-button";
import { StatTile } from "@/components/dashboard/stat-tile";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterDateRange, FilterSelect } from "@/components/filters/filter-controls";
import { FormDialog } from "@/components/forms/form-dialog";
import { PaymentsTabs } from "@/components/payments/payments-tabs";
import { Card, CardHeader } from "@/components/ui/card";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { countActive, readDate, readParam, withParams } from "@/lib/filters";
import { formatCents, formatDate, todayIso } from "@/lib/format";
import { filterMovements, type MovementFilter } from "@/lib/list-filters";
import { getAccountOverview } from "@/services/account.service";
import { listUnits } from "@/services/masterdata.service";

export const metadata: Metadata = { title: "Abrechnungskonto" };

// „Hinzufügen“ kann eine Einzahlung mit Nachweis speichern – die OCR wartet auf Azure.
export const maxDuration = 60;

/**
 * Abrechnungskonto: Anfangssaldo zum Stichtag, alle Ein- und Auszahlungen seither und der
 * aktuelle Saldo je TOP. Tatsächliche Geldbewegungen – getrennt von Kosten und Abrechnung.
 */
export default async function AccountPage({ searchParams }: PageProps<"/einzahlungen/konto">) {
  const user = await requireUser();
  if (!can(user, "account:read")) return <NoAccess />;

  const manages = getDataScope(user).allUnits;
  const canManage = manages && can(user, "account:manage");
  const [account, units] = await Promise.all([getAccountOverview(user), listUnits(user)]);
  const configured = account.startDate !== null;
  // Vorschlag beim Einrichten: Beginn des laufenden Jahres.
  const suggestedStartDate = `${todayIso().slice(0, 4)}-01-01`;

  // Filter der Kontoauszüge: TOP (nur mit Blick auf alle TOPs), Suchtext und Zeitraum.
  const query = await searchParams;
  const unitNumber = new Map(units.map((unit) => [unit.id, unit.number]));
  const selected = manages
    ? units.find((unit) => String(unit.number) === readParam(query, "top"))
    : undefined;
  const filter: MovementFilter = {
    search: readParam(query, "q"),
    from: readDate(query, "von"),
    to: readDate(query, "bis"),
  };
  const activeFilters = countActive([selected, ...Object.values(filter)]);
  const ledgers = account.units.filter((unit) => !selected || unit.unitId === selected.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abrechnungskonto"
        description={
          configured
            ? `Laufende Kontoführung seit ${formatDate(account.startDate)}: Anfangssaldo + Einzahlungen − Auszahlungen.`
            : "Laufendes Konto je TOP: Anfangssaldo zum Stichtag, danach alle Ein- und Auszahlungen."
        }
      >
        {canManage ? (
          <FormDialog
            trigger={
              <>
                <Settings2 aria-hidden />
                {configured ? "Anfangsbestand ändern" : "Konto einrichten"}
              </>
            }
            title={configured ? "Anfangsbestand ändern" : "Abrechnungskonto einrichten"}
            description="Der Anfangsbestand ändert sich nur hier – Ein- und Auszahlungen lassen ihn unberührt. Jede Änderung steht im Audit-Log."
            action={saveAccountOpeningAction}
          >
            <AccountOpeningFields units={units} account={account} suggestedStartDate={suggestedStartDate} />
          </FormDialog>
        ) : null}
        <AddButton user={user} area="payments" />
      </PageHeader>

      <PaymentsTabs />

      {!configured ? (
        <Card>
          <EmptyState
            icon={Landmark}
            title="Die Kontoführung ist noch nicht eingerichtet"
            description={
              canManage
                ? "Lege über „Konto einrichten“ den Stichtag und je TOP den Anfangssaldo fest. Ab dem Stichtag werden alle Ein- und Auszahlungen fortlaufend weitergeführt."
                : "Sobald die Verwaltung Stichtag und Anfangssaldo festlegt, steht hier dein Kontostand."
            }
          />
        </Card>
      ) : account.units.length === 0 ? (
        <Card>
          <p className="p-5 text-sm text-muted">Deinem Konto ist keine TOP zugeordnet.</p>
        </Card>
      ) : (
        <>
          <section aria-label="Kontostand" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={manages ? "Anfangsbestand gesamt" : "Anfangssaldo"}
              value={formatCents(account.openingCents)}
              icon={Flag}
            >
              zum {formatDate(account.startDate)}
            </StatTile>
            <StatTile label="Einzahlungen" value={formatCents(account.inflowCents)} icon={ArrowDownLeft}>
              seit dem Stichtag
            </StatTile>
            <StatTile label="Auszahlungen" value={formatCents(account.outflowCents)} icon={ArrowUpRight}>
              seit dem Stichtag
            </StatTile>
            <StatTile
              label={manages ? "Gesamtbestand" : "Aktueller Saldo"}
              value={formatCents(account.balanceCents)}
              icon={Scale}
            >
              <AccountBalanceBadge cents={account.balanceCents} />
            </StatTile>
          </section>

          {manages ? (
            <Card>
              <CardHeader
                title="Konten je TOP"
                description="Der Gesamtbestand ist die Summe der Salden aller TOPs. Es zählen eingegangene, freigegebene Zahlungen."
              />
              <AccountSummaryTable
                account={account}
                unitHref={(unit) =>
                  withParams(`/einzahlungen/konto#konto-top-${unitNumber.get(unit.unitId)}`, {
                    top: unitNumber.get(unit.unitId),
                  })
                }
              />
            </Card>
          ) : null}

          <section className="space-y-3">
            <h2 className="pt-2 text-base font-semibold">
              {manages ? "Kontobewegungen je TOP" : "Meine Kontobewegungen"}
            </h2>
            <Card>
              <FilterBar
                action="/einzahlungen/konto"
                activeCount={activeFilters}
                className="border-b-0"
                search={{ value: filter.search ?? "", placeholder: "Verwendungszweck …" }}
              >
                {manages ? (
                  <FilterSelect
                    name="top"
                    label="TOP"
                    value={selected?.number}
                    allLabel="Alle TOPs"
                    options={units.map((unit) => ({ value: unit.number, label: unit.name }))}
                  />
                ) : null}
                <FilterDateRange from={filter.from} to={filter.to} subject="Datum der Bewegung" />
              </FilterBar>
            </Card>
            {ledgers.map((unit) => (
              <UnitLedger
                key={unit.unitId}
                id={`konto-top-${unitNumber.get(unit.unitId)}`}
                unit={unit}
                movements={filterMovements(unit.movements, filter)}
                // Zur Einzahlung in der Liste – nur für die Verwaltung: USER sehen dort allein
                // freigegebene Jahre, im Konto aber alle Bewegungen ihrer TOP.
                movementHref={
                  manages
                    ? (movement) =>
                        withParams("/einzahlungen", {
                          jahr: movement.year,
                          top: unitNumber.get(unit.unitId),
                          zahlung: movement.id,
                        })
                    : undefined
                }
                startDate={account.startDate!}
                // Das eigene Konto ist direkt aufgeklappt; die Verwaltung klappt je TOP auf – es sei
                // denn, sie hat gezielt eine TOP gewählt oder die Bewegungen gefiltert.
                defaultOpen={!manages || activeFilters > 0}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
