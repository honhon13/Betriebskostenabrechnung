import "server-only";

import { CalendarPlus, FileUp, ReceiptText, Wallet } from "lucide-react";

import { createCostAction, createPeriodAction } from "@/app/actions/billing";
import { createPaymentAction } from "@/app/actions/payments";
import {
  submitCostAction,
  submitPaymentAction,
  submitPeriodAction,
} from "@/app/actions/submissions";
import type { Permission } from "@/auth/permissions";
import { can, getDataScope } from "@/auth/rbac";
import { CostFields } from "@/components/billing/cost-fields";
import { PeriodFields } from "@/components/billing/period-fields";
import type { LinkOption } from "@/components/documents/document-fields";
import { PaymentFields } from "@/components/payments/payment-fields";
import { todayIso } from "@/lib/format";
import { isOcrAvailable, listLinkOptions } from "@/services/documents.service";
import { listAllocationKeys, listCategories, listUnits } from "@/services/masterdata.service";
import {
  listPeriods,
  listSubmittablePeriods,
  pickDefaultPeriod,
} from "@/services/periods.service";
import { listOwnLinkOptions } from "@/services/submissions.service";
import type { SessionUser } from "@/types/auth";
import type { AllocationKeyDto, CategoryDto, PeriodDto, UnitDto } from "@/types/billing";

import { AddDocumentDialog } from "./add-document-dialog";
import { AddFormDialog } from "./add-form-dialog";
import { AddMenu, type AddMenuItem } from "./add-menu";

/** Bereich der Ansicht – seine Aktion steht im Menü an erster Stelle. */
export type AddArea = "dashboard" | "billing" | "payments" | "documents" | "submissions";

export interface AddContext {
  user: SessionUser;
  area: AddArea;
  /** Abrechnungsjahr der Ansicht – Vorauswahl in den Formularen. */
  period?: PeriodDto | null;
  /** In der Ansicht gewählte TOP – Vorauswahl für Einzahlungen. */
  unitId?: number;
}

/** Was die Aktionen für ihre Formulare brauchen – einmal je Seitenaufruf geladen. */
interface AddData {
  /** Verwaltung: legt direkt an. Alle anderen reichen zur Prüfung ein. */
  manages: boolean;
  /** Wählbare Abrechnungsjahre, neuestes zuerst. */
  periods: PeriodDto[];
  /** Davon die Jahre im Entwurf – nur dort lassen sich Kosten anlegen. */
  draftPeriods: PeriodDto[];
  units: UnitDto[];
  categories: CategoryDto[];
  allocationKeys: AllocationKeyDto[];
  links: { costs: LinkOption[]; payments: LinkOption[] };
  ocrAvailable: boolean;
}

/**
 * Eine „Hinzufügen“-Aktion: prüft das Recht des Benutzers und liefert ihren Menüeintrag samt
 * Dialog – oder null, wenn der Benutzer so etwas nicht anlegen darf.
 */
type AddAction = (context: AddContext, data: AddData) => AddMenuItem | null;

/** Wo eingereichte Einträge stehen – dorthin führt der Dialog nach dem Einreichen. */
const SUBMISSIONS_HREF = "/eingaben";

const yearOptions = (periods: PeriodDto[]) => periods.map((p) => ({ id: p.id, year: p.year }));

const costAction: AddAction = ({ user, period }, data) => {
  const direct = data.manages && can(user, "cost:write");
  if (!direct && !can(user, "cost:submit")) return null;

  const item = {
    key: "cost",
    label: direct ? "Kostenposition hinzufügen" : "Kosten einreichen",
    hint: direct
      ? "Rechnung oder Vorschreibung mit Kostenart, Betrag und Umlageschlüssel."
      : "Eine Rechnung, die du für das Haus bezahlt hast – die Verwaltung prüft sie.",
    icon: <ReceiptText aria-hidden />,
  };

  // Kosten lassen sich nur in Jahren anlegen, deren Abrechnung noch nicht freigegeben ist.
  const drafts = data.draftPeriods;
  const preset = drafts.find((p) => p.id === period?.id) ?? pickDefaultPeriod(drafts);
  if (!preset) {
    const blocked =
      data.periods.length === 0
        ? direct
          ? "Lege zuerst ein Abrechnungsjahr an."
          : "Es gibt noch kein Abrechnungsjahr – schlage zuerst eines vor."
        : direct
          ? "Alle Abrechnungsjahre sind freigegeben und damit gesperrt. Nimm eine Freigabe zurück oder lege ein neues Jahr an."
          : "Derzeit ist kein Abrechnungsjahr offen – Kosten lassen sich nur vor der Freigabe einreichen.";
    return { ...item, blocked, dialog: null };
  }

  const locked = period && period.id !== preset.id && period.status === "released";
  return {
    ...item,
    dialog: direct ? (
      <AddFormDialog
        title="Kostenposition hinzufügen"
        description={
          locked
            ? `Die Abrechnung ${period.year} ist freigegeben – die Position kommt ins Jahr ${preset.year}.`
            : undefined
        }
        action={createCostAction}
      >
        <CostFields
          periods={yearOptions(drafts)}
          periodId={preset.id}
          categories={data.categories}
          allocationKeys={data.allocationKeys}
          units={data.units}
          allowUpload={can(user, "document:write")}
          ocrAvailable={data.ocrAvailable}
        />
      </AddFormDialog>
    ) : (
      <AddFormDialog
        title="Kosten einreichen"
        description="Umlageschlüssel und TOP-Zuordnung legt die Verwaltung bei der Prüfung fest."
        action={submitCostAction}
        submitLabel="Einreichen"
        listHref={SUBMISSIONS_HREF}
      >
        <CostFields
          submission
          periods={yearOptions(drafts)}
          periodId={preset.id}
          categories={data.categories}
          allocationKeys={[]}
          units={[]}
          allowUpload={can(user, "document:submit")}
        />
      </AddFormDialog>
    ),
  };
};

const paymentAction: AddAction = ({ user, period, unitId }, data) => {
  const direct = can(user, "payment:write");
  // Eingereichte Einzahlungen gelten immer für die eigene TOP.
  if (!direct && !(can(user, "payment:submit") && user.unitId !== null)) return null;

  const item = {
    key: "payment",
    label: direct ? "Einzahlung hinzufügen" : "Einzahlung einreichen",
    hint: direct
      ? "Akonto- oder Nachzahlung einer TOP, auf Wunsch mit Zahlungsnachweis."
      : `Eine Zahlung, die du für ${user.unitName ?? "deine TOP"} geleistet hast – am besten mit Nachweis.`,
    icon: <Wallet aria-hidden />,
  };

  const preset =
    data.periods.find((p) => p.id === period?.id) ??
    (direct ? null : pickDefaultPeriod(data.draftPeriods)) ??
    pickDefaultPeriod(data.periods);
  if (!preset || (direct && data.units.length === 0)) {
    const blocked = direct
      ? "Lege zuerst ein Abrechnungsjahr an."
      : "Es gibt noch kein Abrechnungsjahr – schlage zuerst eines vor.";
    return { ...item, blocked, dialog: null };
  }

  return {
    ...item,
    dialog: direct ? (
      <AddFormDialog title="Einzahlung hinzufügen" action={createPaymentAction}>
        <PaymentFields
          periods={data.periods}
          units={data.units}
          defaults={{ periodId: preset.id, unitId, date: todayIso() }}
          allowUpload={data.manages && can(user, "document:write")}
          ocrAvailable={data.ocrAvailable}
        />
      </AddFormDialog>
    ) : (
      <AddFormDialog
        title="Einzahlung einreichen"
        description={`Für ${user.unitName ?? "deine TOP"}.`}
        action={submitPaymentAction}
        submitLabel="Einreichen"
        listHref={SUBMISSIONS_HREF}
      >
        <PaymentFields
          submission
          periods={data.periods}
          units={[]}
          defaults={{ periodId: preset.id, date: todayIso() }}
          allowUpload={can(user, "document:submit")}
        />
      </AddFormDialog>
    ),
  };
};

const documentAction: AddAction = ({ user, period }, data) => {
  const direct = data.manages && can(user, "document:write");
  if (!direct && !can(user, "document:submit")) return null;

  const item = {
    key: "document",
    label: direct ? "Dokument hochladen" : "Dokument einreichen",
    hint: direct
      ? "Rechnungen, Zahlungsnachweise, Verträge und Sonstiges – auch mehrere Dateien auf einmal."
      : "Rechnungen, Nachweise und andere Unterlagen – auch mehrere Dateien auf einmal.",
    icon: <FileUp aria-hidden />,
  };

  const preset =
    data.periods.find((p) => p.id === period?.id) ??
    (direct ? null : pickDefaultPeriod(data.draftPeriods)) ??
    pickDefaultPeriod(data.periods);
  if (!preset) {
    const blocked = direct
      ? "Lege zuerst ein Abrechnungsjahr an."
      : "Es gibt noch kein Abrechnungsjahr – schlage zuerst eines vor.";
    return { ...item, blocked, dialog: null };
  }

  return {
    ...item,
    dialog: (
      <AddDocumentDialog
        submission={!direct}
        periods={yearOptions(data.periods)}
        units={direct ? data.units : []}
        costs={data.links.costs}
        payments={data.links.payments}
        categories={data.categories}
        defaultPeriodId={preset.id}
        ocrAvailable={direct && data.ocrAvailable}
        listHref={direct ? undefined : SUBMISSIONS_HREF}
      />
    ),
  };
};

const periodAction: AddAction = ({ user }, data) => {
  const direct = data.manages && can(user, "period:write");
  if (!direct && !can(user, "period:submit")) return null;

  const thisYear = new Date().getFullYear();
  const next = Math.max(0, ...data.periods.map((p) => p.year)) + 1;
  // Ohne Jahre mit dem laufenden beginnen; Vorschläge von Benutzern nicht in die Vergangenheit legen.
  const suggestedYear = data.periods.length === 0 ? thisYear : direct ? next : Math.max(thisYear, next);

  return {
    key: "period",
    label: direct ? "Abrechnungsjahr hinzufügen" : "Abrechnungsjahr vorschlagen",
    hint: direct
      ? "Eine neue Abrechnung für ein weiteres Jahr."
      : "Ein weiteres Jahr – es wird nach der Prüfung für alle angelegt.",
    icon: <CalendarPlus aria-hidden />,
    // Nach dem Anlegen führt die Action ins neue Jahr – „weiteren Eintrag“ ergibt hier keinen Sinn.
    dialog: direct ? (
      <AddFormDialog
        title="Abrechnungsjahr anlegen"
        description="Wohnfläche und Personen werden aus den Stammdaten der TOPs übernommen."
        action={createPeriodAction}
        submitLabel="Anlegen"
        allowAnother={false}
      >
        <PeriodFields suggestedYear={suggestedYear} />
      </AddFormDialog>
    ) : (
      <AddFormDialog
        title="Abrechnungsjahr vorschlagen"
        description="Das Jahr wird erst nach der Prüfung für alle angelegt."
        action={submitPeriodAction}
        submitLabel="Einreichen"
        allowAnother={false}
        listHref={SUBMISSIONS_HREF}
      >
        <PeriodFields suggestedYear={suggestedYear} />
      </AddFormDialog>
    ),
  };
};

/**
 * Alle „Hinzufügen“-Aktionen, in der Reihenfolge des Menüs. Ein weiterer Datentyp ist eine
 * weitere Funktion in dieser Liste – das Menü, die Schaltfläche und die Seiten bleiben unverändert.
 */
const ADD_ACTIONS: AddAction[] = [costAction, paymentAction, documentAction, periodAction];

/** Aktion, die im jeweiligen Bereich zuerst angeboten wird. */
const PRIMARY: Partial<Record<AddArea, string>> = {
  billing: "cost",
  payments: "payment",
  documents: "document",
};

const WRITE: Permission[] = ["cost:write", "payment:write", "document:write", "period:write"];
const SUBMIT: Permission[] = ["cost:submit", "payment:submit", "document:submit", "period:submit"];

async function loadAddData(user: SessionUser): Promise<AddData> {
  const manages = getDataScope(user).allUnits;
  // Wer einreicht, darf auch Jahre im Entwurf als Ziel wählen – sehen kann er deren Abrechnung nicht.
  const submits = !manages && SUBMIT.some((permission) => can(user, permission));

  const [periods, units, categories, allocationKeys, links] = await Promise.all([
    submits ? listSubmittablePeriods(user) : can(user, "period:read") ? listPeriods(user) : [],
    listUnits(user),
    listCategories(),
    manages ? listAllocationKeys() : [],
    manages && can(user, "document:write")
      ? listLinkOptions(user)
      : can(user, "document:submit")
        ? listOwnLinkOptions(user)
        : { costs: [], payments: [] },
  ]);

  return {
    manages,
    periods,
    draftPeriods: periods.filter((p) => p.status === "draft"),
    units,
    categories,
    allocationKeys,
    links,
    ocrAvailable: manages && can(user, "document:ocr") && isOcrAvailable(),
  };
}

/**
 * Schaltfläche „Hinzufügen“ für den Seitenkopf. Sie bietet an, was der angemeldete Benutzer in
 * dieser Ansicht anlegen darf: die Verwaltung legt direkt an, alle anderen reichen zur Prüfung ein.
 * Verbindlich ist wie überall der Service hinter der jeweiligen Action.
 */
export async function AddButton(context: AddContext) {
  const { user, area } = context;
  if (![...WRITE, ...SUBMIT].some((permission) => can(user, permission))) return null;

  const data = await loadAddData(user);
  const items = ADD_ACTIONS.map((action) => action(context, data)).filter(
    (item): item is AddMenuItem => item !== null,
  );
  if (items.length === 0) return null;

  const primary = PRIMARY[area];
  items.sort((a, b) => Number(b.key === primary) - Number(a.key === primary));
  return <AddMenu items={items} />;
}
