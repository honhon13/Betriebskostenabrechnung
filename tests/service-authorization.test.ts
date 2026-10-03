import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/auth/errors";
import { ROLE_DEFINITIONS, ROLE_KEYS } from "@/auth/permissions";
import * as allocation from "@/services/allocation.service";
import * as costs from "@/services/costs.service";
import * as masterdata from "@/services/masterdata.service";
import * as payments from "@/services/payments.service";
import * as periods from "@/services/periods.service";
import * as review from "@/services/review.service";
import * as submissions from "@/services/submissions.service";
import * as documents from "@/services/documents.service";
import * as users from "@/services/users.service";
import type { SessionUser } from "@/types/auth";

/**
 * Die Oberfläche blendet Schaltflächen nur aus – verbindlich ist die Prüfung im Service.
 * Jede schreibende Funktion muss einen USER ablehnen, bevor sie die Datenbank anfasst.
 * (Die Tests laufen ohne DATABASE_URL: käme ein Aufruf bis zur Datenbank, schlüge er
 * mit einem anderen Fehler fehl als ForbiddenError.)
 */
const user: SessionUser = {
  id: 1,
  username: "top1",
  displayName: "TOP 1",
  roleKey: ROLE_KEYS.USER,
  roleName: "Benutzer",
  unitId: 1,
  unitName: "TOP 1",
  mustChangePassword: false,
  permissions: ROLE_DEFINITIONS.find((role) => role.key === ROLE_KEYS.USER)!.permissions,
};

const cost = {
  periodId: 1,
  categoryId: 1,
  description: "x",
  amount: 100,
  costDate: null,
  supplier: null,
  invoiceNumber: null,
  allocationKeyId: 1,
  unitIds: [1],
  notes: null,
};
const payment = {
  periodId: 1,
  unitId: 2,
  paymentDate: "2025-01-01",
  amount: 100,
  purpose: null,
  note: null,
  status: "received" as const,
};
const documentMeta = {
  type: "invoice" as const,
  description: null,
  unitId: null,
  costIds: [1],
  paymentId: null,
  documentDate: null,
  supplier: null,
  invoiceNumber: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  netAmount: null,
  taxAmount: null,
  amount: null,
};
const file = { name: "x.pdf", bytes: Buffer.from("%PDF-1.4") };
const key = { name: "x", unitLabel: "", description: null, isActive: true };
const category = { name: "x", description: null, defaultAllocationKeyId: null, isActive: true };

const forbiddenForUser: Record<string, () => Promise<unknown>> = {
  // Abrechnungsjahre
  createPeriod: () => periods.createPeriod(user, { year: 2030, notes: null }),
  setPeriodStatus: () => periods.setPeriodStatus(user, 1, "released"),
  deletePeriod: () => periods.deletePeriod(user, 1),
  // Kosten & Umlageschlüssel
  listCosts: () => costs.listCosts(user, 1),
  createCost: () => costs.createCost(user, cost),
  updateCost: () => costs.updateCost(user, 1, cost),
  deleteCost: () => costs.deleteCost(user, 1),
  listAllocationValues: () => allocation.listAllocationValues(user, 1),
  saveAllocationValues: () => allocation.saveAllocationValues(user, 1, []),
  resetAllocationValues: () => allocation.resetAllocationValuesFromUnits(user, 1),
  // Einzahlungen
  createPayment: () => payments.createPayment(user, payment),
  updatePayment: () => payments.updatePayment(user, 1, payment),
  deletePayment: () => payments.deletePayment(user, 1),
  // Dokumente
  uploadDocument: () => documents.uploadDocument(user, 1, file, documentMeta),
  updateDocument: () => documents.updateDocument(user, 1, 1, documentMeta),
  deleteDocument: () => documents.deleteDocument(user, 1),
  runDocumentOcr: () => documents.runDocumentOcr(user, 1),
  processDocumentOcr: () => documents.processDocumentOcr(user, 1),
  fillCostFromOcr: () =>
    costs.fillCostFromOcr(user, 1, { documentDate: null, supplier: null, invoiceNumber: null }),
  // Prüfung
  listReviewItems: () => review.listReviewItems(user, "pending"),
  countPendingReviews: () => review.countPendingReviews(user),
  reviewEntry: () => review.reviewEntry(user, "cost", 1, "approved", null),
  listLinkOptions: () => documents.listLinkOptions(user),
  // Stammdaten
  updateUnit: () => masterdata.updateUnit(user, 1, { name: "x", areaSqm: null, persons: null, notes: null }),
  createCategory: () => masterdata.createCategory(user, category),
  updateCategory: () => masterdata.updateCategory(user, 1, category),
  deleteCategory: () => masterdata.deleteCategory(user, 1),
  createAllocationKey: () => masterdata.createAllocationKey(user, key),
  updateAllocationKey: () => masterdata.updateAllocationKey(user, 1, key),
  deleteAllocationKey: () => masterdata.deleteAllocationKey(user, 1),
  // Benutzer & Rollen
  listUsers: () => users.listUsers(user),
  createUser: () =>
    users.createUser(user, { username: "x", displayName: "x", roleId: 1, unitId: null, password: "x".repeat(12) }),
  updateUser: () => users.updateUser(user, 1, { displayName: "x", roleId: 1, unitId: null, isActive: true }),
  resetUserPassword: () => users.resetUserPassword(user, 2),
  deleteUser: () => users.deleteUser(user, 2),
  listRoles: () => users.listRoles(user),
  updateRolePermissions: () => users.updateRolePermissions(user, 2, ["user:manage"]),
  createRole: () => users.createRole(user, { name: "x", description: null }),
  deleteRole: () => users.deleteRole(user, 2),
};

/**
 * Einreichen ist ein eigenes Recht. Eine Rolle, die nur lesen darf, kann auch nichts
 * einreichen – und USER selbst können über diese Funktionen nichts direkt freigeben.
 */
const reader: SessionUser = {
  ...user,
  roleKey: "LESER",
  permissions: ["dashboard:view", "period:read", "cost:read", "payment:read", "document:read"],
};
const costSubmission = {
  periodId: 1,
  categoryId: 1,
  description: "x",
  amount: 100,
  costDate: null,
  supplier: null,
  invoiceNumber: null,
  notes: null,
};
const paymentSubmission = { periodId: 1, paymentDate: "2025-01-01", amount: 100, purpose: null, note: null };

const forbiddenForReader: Record<string, () => Promise<unknown>> = {
  submitPeriod: () => submissions.submitPeriod(reader, { year: 2030, notes: null }),
  submitCost: () => submissions.submitCost(reader, costSubmission),
  updateOwnCost: () => submissions.updateOwnCost(reader, 1, costSubmission),
  submitPayment: () => submissions.submitPayment(reader, paymentSubmission),
  updateOwnPayment: () => submissions.updateOwnPayment(reader, 1, paymentSubmission),
  submitDocument: () => submissions.submitDocument(reader, 1, file, documentMeta),
  updateOwnDocument: () => submissions.updateOwnDocument(reader, 1, documentMeta),
};

describe("Services lehnen USER serverseitig ab", () => {
  it.each(Object.keys(forbiddenForUser))("%s", async (name) => {
    await expect(forbiddenForUser[name]()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("USER darf einreichen, aber weder direkt schreiben, löschen noch prüfen", () => {
    const permissions = user.permissions;
    expect(permissions).toEqual(
      expect.arrayContaining(["period:submit", "cost:submit", "payment:submit", "document:submit"]),
    );
    expect(permissions.filter((p) => /:(write|delete|release|manage|ocr)$/.test(p))).toEqual([]);
  });

  it("deckt jede schreibende Service-Funktion ab", () => {
    const mutating = [allocation, costs, documents, masterdata, payments, periods, review, users]
      .flatMap((module) => Object.keys(module))
      .filter((name) =>
        /^(create|update|delete|set|save|reset|upload|run|process|fill|review)/.test(name),
      );
    const covered = new Set([
      ...Object.keys(forbiddenForUser),
      "resetAllocationValuesFromUnits", // oben als resetAllocationValues
    ]);
    expect(mutating.filter((name) => !covered.has(name))).toEqual([]);
  });
});

describe("Einreichen setzt das jeweilige Recht voraus", () => {
  it.each(Object.keys(forbiddenForReader))("%s", async (name) => {
    await expect(forbiddenForReader[name]()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deckt jede einreichende Service-Funktion ab", () => {
    const submitting = Object.keys(submissions).filter((name) => /^(submit|updateOwn)/.test(name));
    expect(submitting.filter((name) => !(name in forbiddenForReader))).toEqual([]);
  });
});
