import type { CategorySuggestion } from "@/types/billing";

/** Ab dieser Sicherheit wird die Kostenart automatisch zugeordnet – darunter bleibt sie offen. */
export const CATEGORY_AUTO_ASSIGN_CONFIDENCE = 0.7;

export interface CategoryOption {
  id: number;
  name: string;
  description: string | null;
}

/** Eine frühere Zuordnung: Rechnungssteller → Kostenart, mit ihrer Häufigkeit. */
export interface CategoryHistoryEntry {
  supplier: string;
  categoryId: number;
  count: number;
}

export interface CategorySuggestionInput {
  supplier: string | null;
  /** Beschreibung laut Beleg, z. B. die Rechnungspositionen. */
  description: string | null;
  /** Volltext des Belegs, soweit vorhanden. */
  text: string | null;
  /** Kostenarten, die zur Wahl stehen (nur aktive). */
  categories: CategoryOption[];
  /** Bisherige Zuordnungen aller Rechnungssteller. */
  history: CategoryHistoryEntry[];
}

export interface CategorySuggestionResult {
  /** Beste Kostenart – null, wenn nichts passt. */
  category: CategorySuggestion | null;
  /** true = sicher genug für die automatische Zuordnung. */
  certain: boolean;
  /** Weitere Kandidaten, beste zuerst. */
  alternatives: CategorySuggestion[];
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Kleinschreibung und Umlaute aufgelöst – „Müllgebühr“ und „MUELLGEBUEHR“ werden gleich. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

const words = (value: string) => fold(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Rechtsformen und Füllwörter, die nichts über den Rechnungssteller aussagen. */
const SUPPLIER_NOISE = new Set(
  ["gmbh", "gesmbh", "ges", "mbh", "ag", "kg", "og", "keg", "ohg", "eu", "ek", "se", "co", "und", "ltd", "inc"],
);

/** Vergleichsform eines Rechnungsstellers: „Muster & Söhne GmbH“ → „muster soehne“. */
export function normalizeSupplier(name: string): string {
  return words(name)
    .filter((word) => word.length > 1 && !SUPPLIER_NOISE.has(word))
    .join(" ");
}

/** Wie sicher zwei Schreibweisen denselben Rechnungssteller meinen (0–1). */
function supplierSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a.split(" "), b.split(" ")] : [b.split(" "), a.split(" ")];
  const common = short.filter((word) => long.includes(word)).length;
  // Ein Name steckt ganz im anderen: „Stadtwerke“ ↔ „Stadtwerke Musterstadt“.
  if (common === short.length && short.join("").length >= 5) return 0.85;
  return common / new Set([...short, ...long]).size >= 0.6 ? 0.7 : 0;
}

// ---------------------------------------------------------------------------
// Stichwörter
// ---------------------------------------------------------------------------

/**
 * Wortstämme, die zusammengehören. Eine Kostenart gehört zu einer Gruppe, sobald ihr Name oder
 * ihre Beschreibung einen der Stämme enthält – ein Beleg mit einem anderen Stamm derselben Gruppe
 * passt dann zu ihr („Kehrung“ → Kostenart „Rauchfangkehrer“). Eigene Kostenarten lassen sich
 * über ihre Beschreibung in den Stammdaten mit weiteren Stichwörtern versehen.
 *
 * Bewusst keine kurzen Wortteile wie „gas“ – sie stecken auch in Adressen („Hauptgasse“).
 */
const KEYWORD_GROUPS: string[][] = [
  ["wasser"],
  ["kanal"],
  ["müll", "abfall", "entsorgung", "altpapier"],
  ["grundsteuer"],
  ["versicherung", "polizze", "haftpflicht"],
  ["rauchfang", "kehrung", "kaminkehr", "schornstein", "abgasmess", "feuerbeschau"],
  ["strom", "netzentgelt", "elektrizität"],
  ["heizung", "heizkosten", "heizöl", "fernwärme", "erdgas", "gasverbrauch", "pellets", "brennstoff"],
  ["reinigung", "hausbetreuung", "hausmeister", "hausbesorger"],
  ["winterdienst", "schneeräum", "streudienst"],
  ["garten", "rasen", "hecke", "baumschnitt", "grünpflege"],
  ["wartung", "instandhaltung", "instandsetzung", "reparatur", "installateur"],
  ["verwaltung", "bankspesen", "kontoführung"],
  ["aufzug", "lift"],
].map((group) => group.map(fold));

/** Wörter in Kostenart-Namen, die auf jeden Beleg passen würden. */
const CATEGORY_NOISE = new Set(
  ["sonstiges", "sonstige", "allgemein", "allgemeine", "kosten", "gebuehr", "gebuehren", "diverse", "diverses", "andere"],
);
const MIN_KEYWORD_LENGTH = 4;

/** Treffer im Rechnungssteller oder in der Beschreibung wiegen mehr als einer irgendwo im Text. */
const PRIMARY_WEIGHT = 3;
const TEXT_WEIGHT = 1;
/** Ab hier gilt ein Stichwort-Ergebnis als belastbar: mindestens ein Treffer an prominenter Stelle. */
const STRONG_SCORE = PRIMARY_WEIGHT;

/**
 * Stichwörter einer Kostenart: ihre eigenen Wörter plus alle Stämme ihrer Gruppen. Steckt ein
 * Stichwort in einem anderen („wasser“ in „abwasser“), bleibt nur das kürzere – sonst zählte
 * derselbe Treffer doppelt.
 */
function keywordsOf(category: CategoryOption): string[] {
  const own = fold(`${category.name} ${category.description ?? ""}`);
  const groups = KEYWORD_GROUPS.filter((group) => group.some((term) => own.includes(term)));
  const ownWords = words(own).filter(
    (word) => word.length >= MIN_KEYWORD_LENGTH && !CATEGORY_NOISE.has(word),
  );
  const all = [...new Set([...ownWords, ...groups.flat()])];
  return all.filter((keyword) => !all.some((other) => other !== keyword && keyword.includes(other)));
}

/** Das Wort des Belegs, in dem das Stichwort steckt – in seiner Schreibweise, für die Begründung. */
function wordContaining(source: string, keyword: string): string | null {
  return source.split(/[^\p{L}\p{N}]+/u).find((word) => fold(word).includes(keyword)) ?? null;
}

interface KeywordScore {
  score: number;
  /** Ein gefundenes Stichwort für die Begründung – bevorzugt eines an prominenter Stelle. */
  hit: string | null;
}

function keywordScore(category: CategoryOption, primary: string, text: string): KeywordScore {
  const foldedPrimary = fold(primary);
  const foldedText = fold(text);
  let score = 0;
  let primaryHit: string | null = null;
  let textHit: string | null = null;
  for (const keyword of keywordsOf(category)) {
    if (foldedPrimary.includes(keyword)) {
      score += PRIMARY_WEIGHT;
      primaryHit ??= wordContaining(primary, keyword);
    } else if (foldedText.includes(keyword)) {
      score += TEXT_WEIGHT;
      textHit ??= wordContaining(text, keyword);
    }
  }
  return { score, hit: primaryHit ?? textHit };
}

// ---------------------------------------------------------------------------
// Vorschlag
// ---------------------------------------------------------------------------

/**
 * Schlägt für einen Beleg eine Kostenart vor – aus bisherigen Zuordnungen desselben
 * Rechnungsstellers und aus Stichwörtern in Rechnungssteller, Beschreibung und Text.
 *
 * 1. Wurde der Rechnungssteller bisher (fast) immer derselben Kostenart zugeordnet, gilt diese.
 * 2. Verteilt er sich auf mehrere Kostenarten (z. B. „Gemeinde“: Kanal, Müll, Grundsteuer),
 *    entscheiden die Stichwörter des Belegs zwischen ihnen.
 * 3. Ohne Vorgeschichte entscheiden allein die Stichwörter – sofern eine Kostenart klar vorne liegt.
 *
 * Reicht die Sicherheit nicht, gibt es nur Kandidaten: die Auswahl bleibt dann offen.
 */
export function suggestCategory(input: CategorySuggestionInput): CategorySuggestionResult {
  const { categories } = input;
  const byId = new Map(categories.map((category) => [category.id, category]));

  // Bisherige Zuordnungen dieses Rechnungsstellers je Kostenart: gewichtet nach Ähnlichkeit der
  // Schreibweise (für die Entscheidung) und als reine Anzahl (für die Begründung).
  const supplier = input.supplier ? normalizeSupplier(input.supplier) : "";
  const history = new Map<number, { weight: number; count: number }>();
  for (const entry of input.history) {
    if (!byId.has(entry.categoryId)) continue;
    const similarity = supplierSimilarity(supplier, normalizeSupplier(entry.supplier));
    if (similarity === 0) continue;
    const seen = history.get(entry.categoryId) ?? { weight: 0, count: 0 };
    history.set(entry.categoryId, {
      weight: seen.weight + similarity * entry.count,
      count: seen.count + entry.count,
    });
  }
  const weightOf = (id: number) => history.get(id)?.weight ?? 0;
  const historyTotal = [...history.values()].reduce((acc, seen) => acc + seen.weight, 0);

  const primary = `${input.supplier ?? ""} ${input.description ?? ""}`;
  const keywords = new Map(
    categories.map(
      (category) => [category.id, keywordScore(category, primary, input.text ?? "")] as const,
    ),
  );
  const scoreOf = (id: number) => keywords.get(id)?.score ?? 0;

  const suggestion = (id: number, confidence: number, reason: string): CategorySuggestion => ({
    categoryId: id,
    categoryName: byId.get(id)!.name,
    confidence: Math.round(confidence * 100) / 100,
    reason,
  });
  const keywordReason = (id: number) => `Stichwort „${keywords.get(id)?.hit ?? ""}“ im Beleg`;
  const historyReason = (id: number) =>
    `Rechnungssteller bisher ${history.get(id)?.count ?? 0}× dieser Kostenart zugeordnet`;

  /** Kostenarten nach Stichwort-Treffern, beste zuerst. */
  const ranked = (ids: number[]) =>
    ids.filter((id) => scoreOf(id) > 0).sort((a, b) => scoreOf(b) - scoreOf(a));
  /** Die beste Kostenart, wenn sie belastbar ist und klar vor der zweiten liegt. */
  const clearWinner = (ids: number[]): number | null => {
    const [first, second] = ranked(ids);
    if (first === undefined || scoreOf(first) < STRONG_SCORE) return null;
    return second === undefined || scoreOf(first) >= 2 * scoreOf(second) ? first : null;
  };

  const allIds = categories.map((category) => category.id);
  const byHistory = [...history.keys()].sort((a, b) => weightOf(b) - weightOf(a));
  const result = (best: CategorySuggestion, others: CategorySuggestion[]): CategorySuggestionResult => ({
    category: best,
    certain: best.confidence >= CATEGORY_AUTO_ASSIGN_CONFIDENCE,
    alternatives: others.filter((other) => other.categoryId !== best.categoryId).slice(0, 3),
  });
  /** Kandidaten für die Auswahl von Hand: erst die bisherigen Kostenarten, dann Stichwort-Treffer. */
  const candidates = (): CategorySuggestion[] => [
    ...byHistory.map((id) =>
      suggestion(id, 0.3 + 0.3 * (weightOf(id) / historyTotal), historyReason(id)),
    ),
    ...ranked(allIds)
      .filter((id) => !history.has(id))
      .map((id) => suggestion(id, Math.min(0.6, 0.2 + scoreOf(id) / 10), keywordReason(id))),
  ];

  if (historyTotal > 0) {
    const favourite = byHistory[0];
    if (weightOf(favourite) / historyTotal >= 0.8) {
      // Spricht der Beleg selbst deutlich stärker für eine Kostenart, die dieser Rechnungssteller
      // noch nie hatte, ist die Gewohnheit kein Beweis – dann lieber nachfragen.
      const contradicting = clearWinner(allIds.filter((id) => !history.has(id)));
      if (contradicting !== null && scoreOf(contradicting) >= 2 * scoreOf(favourite)) {
        return result(suggestion(favourite, 0.5, historyReason(favourite)), candidates());
      }
      const confidence = Math.min(0.95, 0.8 + 0.05 * Math.min(3, weightOf(favourite)));
      return result(suggestion(favourite, confidence, historyReason(favourite)), candidates());
    }

    const among = clearWinner(byHistory);
    if (among !== null) {
      const reason = `Rechnungssteller mehreren Kostenarten zugeordnet – ${keywordReason(among)} passt zu dieser`;
      return result(suggestion(among, 0.85, reason), candidates());
    }
  }

  const winner = clearWinner(allIds);
  if (winner !== null) {
    const confidence = scoreOf(winner) >= 2 * STRONG_SCORE ? 0.85 : 0.75;
    return result(suggestion(winner, confidence, keywordReason(winner)), candidates());
  }

  const [best, ...others] = candidates();
  return best ? result(best, others) : { category: null, certain: false, alternatives: [] };
}
