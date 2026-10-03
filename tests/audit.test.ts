import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTIONS,
  AUDIT_AREAS,
  auditActionLabel,
  auditActionsOf,
  diffSnapshots,
  isAuditArea,
  snapshotValues,
  type AuditAction,
  type AuditArea,
} from "@/lib/audit";

describe("Audit-Log: Katalog", () => {
  it("jede Aktion gehört zu einem bekannten Bereich", () => {
    for (const action of Object.keys(AUDIT_ACTIONS) as AuditAction[]) {
      expect(AUDIT_AREAS).toHaveProperty(AUDIT_ACTIONS[action].area);
      expect(AUDIT_ACTIONS[action].label).not.toBe("");
    }
  });

  it("jeder Bereich hat Aktionen – und zusammen sind es alle", () => {
    const areas = Object.keys(AUDIT_AREAS) as AuditArea[];
    for (const area of areas) expect(auditActionsOf(area).length).toBeGreaterThan(0);
    expect(areas.flatMap(auditActionsOf).sort()).toEqual(Object.keys(AUDIT_ACTIONS).sort());
  });

  it("deckt die geforderten Aktionen ab", () => {
    expect(Object.keys(AUDIT_ACTIONS)).toEqual(
      expect.arrayContaining([
        "auth.login",
        "auth.logout",
        "period.created",
        "period.released",
        "period.deleted",
        "cost.created",
        "cost.updated",
        "cost.deleted",
        "document.uploaded",
        "document.deleted",
        "payment.created",
        "payment.updated",
        "review.approved",
        "review.rejected",
        "user.password_reset",
      ]),
    );
  });

  it("unbekannte Aktionen und Bereiche bleiben lesbar bzw. werden abgewiesen", () => {
    expect(auditActionLabel("cost.created")).toBe("Kostenposition angelegt");
    expect(auditActionLabel("etwas.anderes")).toBe("etwas.anderes");
    expect(isAuditArea("cost")).toBe(true);
    expect(isAuditArea("alle")).toBe(false);
  });
});

describe("Audit-Log: vorher → nachher", () => {
  const before = { Beschreibung: "Kehrung", Betrag: "€ 200,00", Rechnungssteller: null, TOPs: "TOP 1, TOP 2" };

  it("nennt nur geänderte Felder – auch neu gefüllte und geleerte", () => {
    const after = { Beschreibung: "Kehrung", Betrag: "€ 214,80", Rechnungssteller: "Muster GmbH", TOPs: null };
    expect(diffSnapshots(before, after)).toEqual([
      { field: "Betrag", from: "€ 200,00", to: "€ 214,80" },
      { field: "Rechnungssteller", from: null, to: "Muster GmbH" },
      { field: "TOPs", from: "TOP 1, TOP 2", to: null },
    ]);
  });

  it("ohne Änderung bleibt die Liste leer", () => {
    expect(diffSnapshots(before, { ...before })).toEqual([]);
  });

  it("snapshotValues lässt leere Felder weg und behält die Reihenfolge", () => {
    expect(snapshotValues(before)).toEqual([
      { field: "Beschreibung", value: "Kehrung" },
      { field: "Betrag", value: "€ 200,00" },
      { field: "TOPs", value: "TOP 1, TOP 2" },
    ]);
  });
});
