import { isCredit } from "@/lib/billing/allocation";
import { inAmountRange, inDateRange, matchesSearch } from "@/lib/filters";
import type {
  AccountMovement,
  CostDto,
  PaymentDto,
  PeriodStatus,
  RecurringCostDto,
  RecurringInterval,
  ReviewStatus,
} from "@/types/billing";

/**
 * Filterlogik der Listenansichten – reine Funktionen über Daten, die der jeweilige Service dem
 * Benutzer bereits geliefert hat. Ein Filter kann den Sichtbereich daher nur weiter einschränken,
 * nie erweitern.
 */

// ---------------------------------------------------------------------------
// Kosten
// ---------------------------------------------------------------------------

export interface CostListFilter {
  /** Beschreibung, Kostenart, Rechnungssteller, Rechnungsnummer, Notiz. */
  search?: string;
  categoryId?: number;
  /** Nur Positionen, an denen diese TOP beteiligt ist. */
  unitId?: number;
  /** cost = Kostenpositionen, credit = Gutschriften (negativer Betrag). */
  kind?: "cost" | "credit";
  reviewStatus?: ReviewStatus;
  /** Mit bzw. ohne verknüpften Beleg. */
  receipt?: "with" | "without";
  /** Rechnungsdatum. */
  from?: string;
  to?: string;
  minCents?: number;
  maxCents?: number;
}

type FilterableCost = Pick<
  CostDto,
  | "categoryId"
  | "categoryName"
  | "description"
  | "supplier"
  | "invoiceNumber"
  | "notes"
  | "amountCents"
  | "costDate"
  | "unitIds"
  | "documents"
  | "reviewStatus"
>;

export function filterCosts<T extends FilterableCost>(costs: T[], filter: CostListFilter): T[] {
  return costs.filter(
    (cost) =>
      matchesSearch(filter.search, [
        cost.description,
        cost.categoryName,
        cost.supplier,
        cost.invoiceNumber,
        cost.notes,
      ]) &&
      (filter.categoryId === undefined || cost.categoryId === filter.categoryId) &&
      (filter.unitId === undefined || cost.unitIds.includes(filter.unitId)) &&
      (filter.kind === undefined || isCredit(cost.amountCents) === (filter.kind === "credit")) &&
      (filter.reviewStatus === undefined || cost.reviewStatus === filter.reviewStatus) &&
      (filter.receipt === undefined ||
        (cost.documents.length > 0) === (filter.receipt === "with")) &&
      inDateRange(cost.costDate, filter.from, filter.to) &&
      inAmountRange(cost.amountCents, filter.minCents, filter.maxCents),
  );
}

// ---------------------------------------------------------------------------
// Einzahlungen
// ---------------------------------------------------------------------------

export interface PaymentListFilter {
  /** Verwendungszweck, Notiz, TOP. */
  search?: string;
  reviewStatus?: ReviewStatus;
  /** in = Einzahlung (positiv), out = Auszahlung (negativ). */
  direction?: "in" | "out";
  /** Zahlungsdatum. */
  from?: string;
  to?: string;
  minCents?: number;
  maxCents?: number;
}

type FilterablePayment = Pick<
  PaymentDto,
  "purpose" | "note" | "unitName" | "paymentDate" | "amountCents" | "reviewStatus"
>;

/** Jahr, TOP und Zahlungsstatus filtert bereits der Service – hier der Rest. */
export function filterPayments<T extends FilterablePayment>(
  payments: T[],
  filter: PaymentListFilter,
): T[] {
  return payments.filter(
    (payment) =>
      matchesSearch(filter.search, [payment.purpose, payment.note, payment.unitName]) &&
      (filter.reviewStatus === undefined || payment.reviewStatus === filter.reviewStatus) &&
      (filter.direction === undefined ||
        (payment.amountCents < 0) === (filter.direction === "out")) &&
      inDateRange(payment.paymentDate, filter.from, filter.to) &&
      inAmountRange(payment.amountCents, filter.minCents, filter.maxCents),
  );
}

// ---------------------------------------------------------------------------
// Abrechnungskonto
// ---------------------------------------------------------------------------

export interface MovementFilter {
  /** Verwendungszweck. */
  search?: string;
  from?: string;
  to?: string;
}

/** Bewegungen eines Kontos – der Saldo je Zeile bleibt der tatsächliche Kontostand. */
export function filterMovements(movements: AccountMovement[], filter: MovementFilter): AccountMovement[] {
  return movements.filter(
    (movement) =>
      matchesSearch(filter.search, [
        movement.purpose ?? (movement.amountCents < 0 ? "Auszahlung" : "Einzahlung"),
        movement.year,
      ]) && inDateRange(movement.date, filter.from, filter.to),
  );
}

// ---------------------------------------------------------------------------
// Prüfung und eigene Eingaben
// ---------------------------------------------------------------------------

export type ReviewKindFilter = "period" | "cost" | "payment" | "document";

export interface ReviewListFilter {
  /** Titel, Angaben, TOP, Einreicher. */
  search?: string;
  kind?: ReviewKindFilter;
  year?: number;
  /** Anzeigename des Einreichers. */
  submittedBy?: string;
  /** Tag der Einreichung. */
  from?: string;
  to?: string;
  minCents?: number;
  maxCents?: number;
}

interface FilterableReviewItem {
  kind: ReviewKindFilter;
  title: string;
  detail: string;
  year: number;
  unitName: string | null;
  amountCents: number | null;
  submittedBy: string | null;
  submittedAt: string;
}

export function filterReviewItems<T extends FilterableReviewItem>(
  items: T[],
  filter: ReviewListFilter,
): T[] {
  return items.filter(
    (item) =>
      matchesSearch(filter.search, [item.title, item.detail, item.unitName, item.submittedBy]) &&
      (filter.kind === undefined || item.kind === filter.kind) &&
      (filter.year === undefined || item.year === filter.year) &&
      (filter.submittedBy === undefined || item.submittedBy === filter.submittedBy) &&
      inDateRange(localDay(item.submittedAt), filter.from, filter.to) &&
      inAmountRange(item.amountCents, filter.minCents, filter.maxCents),
  );
}

/** Kalendertag eines Zeitpunkts in österreichischer Zeit – so, wie er in der Liste steht. */
export function localDay(timestamp: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date(timestamp));
}

export interface SubmissionFilter {
  search?: string;
  year?: number;
  reviewStatus?: ReviewStatus;
}

/**
 * Eigene Eingaben (Kosten, Einzahlungen, Dokumente, Jahre) nach Suchtext, Jahr und Prüfstand.
 * `searchable` nennt je Eintrag die Felder, in denen gesucht wird.
 */
export function filterSubmissions<T extends { year: number; reviewStatus: ReviewStatus }>(
  items: T[],
  filter: SubmissionFilter,
  searchable: (item: T) => (string | number | null | undefined)[],
): T[] {
  return items.filter(
    (item) =>
      matchesSearch(filter.search, searchable(item)) &&
      (filter.year === undefined || item.year === filter.year) &&
      (filter.reviewStatus === undefined || item.reviewStatus === filter.reviewStatus),
  );
}

// ---------------------------------------------------------------------------
// Wiederkehrende Kosten
// ---------------------------------------------------------------------------

export interface RecurringListFilter {
  /** Beschreibung, Kostenart, Rechnungssteller, Notiz. */
  search?: string;
  categoryId?: number;
  interval?: RecurringInterval;
  active?: boolean;
  /** Nur Vorlagen, an denen diese TOP beteiligt ist. */
  unitId?: number;
}

export function filterRecurring(
  templates: RecurringCostDto[],
  filter: RecurringListFilter,
): RecurringCostDto[] {
  return templates.filter(
    (template) =>
      matchesSearch(filter.search, [
        template.description,
        template.categoryName,
        template.supplier,
        template.notes,
      ]) &&
      (filter.categoryId === undefined || template.categoryId === filter.categoryId) &&
      (filter.interval === undefined || template.interval === filter.interval) &&
      (filter.active === undefined || template.isActive === filter.active) &&
      (filter.unitId === undefined || template.unitIds.includes(filter.unitId)),
  );
}

// ---------------------------------------------------------------------------
// Jahresübersicht
// ---------------------------------------------------------------------------

export interface YearFilter {
  status?: PeriodStatus;
  fromYear?: number;
  toYear?: number;
}

export function filterYears<T extends { period: { year: number; status: PeriodStatus } }>(
  years: T[],
  filter: YearFilter,
): T[] {
  return years.filter(
    ({ period }) =>
      (filter.status === undefined || period.status === filter.status) &&
      (filter.fromYear === undefined || period.year >= filter.fromYear) &&
      (filter.toYear === undefined || period.year <= filter.toYear),
  );
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** active = darf sich anmelden, initial = muss das Initialpasswort noch ändern. */
export type UserStatusFilter = "active" | "initial" | "inactive";

export interface UserListFilter {
  /** Benutzername, Anzeigename, Rolle, Wohneinheit. */
  search?: string;
  roleId?: number;
  /** "none" = Benutzer ohne Wohneinheit. */
  unitId?: number | "none";
  status?: UserStatusFilter;
}

interface FilterableUser {
  username: string;
  displayName: string;
  roleId: number;
  roleName: string;
  unitId: number | null;
  unitName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

/** Status eines Zugangs, wie ihn die Benutzerliste zeigt. */
export function userStatusOf(user: Pick<FilterableUser, "isActive" | "mustChangePassword">): UserStatusFilter {
  return !user.isActive ? "inactive" : user.mustChangePassword ? "initial" : "active";
}

export function filterUsers<T extends FilterableUser>(users: T[], filter: UserListFilter): T[] {
  return users.filter(
    (user) =>
      matchesSearch(filter.search, [user.username, user.displayName, user.roleName, user.unitName]) &&
      (filter.roleId === undefined || user.roleId === filter.roleId) &&
      (filter.unitId === undefined ||
        (filter.unitId === "none" ? user.unitId === null : user.unitId === filter.unitId)) &&
      (filter.status === undefined || userStatusOf(user) === filter.status),
  );
}

export interface MasterDataFilter {
  /** Name und Beschreibung bzw. Notiz. */
  search?: string;
  /** Nur für Einträge mit Aktiv-Schalter (Kostenarten, Umlageschlüssel). */
  active?: boolean;
}

export function filterMasterData<
  T extends { name: string; description?: string | null; notes?: string | null; isActive?: boolean },
>(items: T[], filter: MasterDataFilter): T[] {
  return items.filter(
    (item) =>
      matchesSearch(filter.search, [item.name, item.description, item.notes]) &&
      (filter.active === undefined || item.isActive === undefined || item.isActive === filter.active),
  );
}
