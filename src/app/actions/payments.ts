"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { authorizeGlobalWrite, can } from "@/auth/rbac";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { DomainError } from "@/lib/errors";
import { formToObject } from "@/lib/form-data";
import { readUpload } from "@/lib/upload";
import { parseId, paymentSchema, type PaymentInput } from "@/lib/validation";
import {
  checkUpload,
  isOcrAvailable,
  processDocumentOcr,
  uploadDocument,
  type UploadedFile,
} from "@/services/documents.service";
import { createPayment, deletePayment, updatePayment } from "@/services/payments.service";
import type { SessionUser } from "@/types/auth";

/**
 * Hängt den im Formular mitgeschickten Nachweis an die Einzahlung und liest ihn – wie beim
 * Dokument-Upload – automatisch per OCR aus. Ein OCR-Fehler steht am Dokument und lässt
 * das Speichern nicht scheitern.
 */
async function attachProof(
  actor: SessionUser,
  paymentId: number,
  input: PaymentInput,
  file: UploadedFile,
): Promise<void> {
  let documentId: number;
  try {
    documentId = await uploadDocument(actor, input.periodId, file, {
      type: "payment_proof",
      description: input.purpose,
      unitId: input.unitId,
      costIds: [],
      paymentId,
      documentDate: input.paymentDate,
      supplier: null,
      invoiceNumber: null,
      servicePeriodStart: null,
      servicePeriodEnd: null,
      netAmount: null,
      taxAmount: null,
      amount: input.amount,
    });
  } catch (error) {
    revalidatePath("/", "layout");
    const reason = error instanceof DomainError ? ` ${error.message}` : "";
    throw new DomainError(
      `Die Einzahlung ist gespeichert, der Nachweis konnte aber nicht abgelegt werden.${reason}`,
    );
  }

  if (isOcrAvailable() && can(actor, "document:ocr")) {
    await processDocumentOcr(actor, documentId);
  }
}

async function readProof(actor: SessionUser, formData: FormData, input: PaymentInput) {
  const file = await readUpload(formData);
  if (file) {
    // Erst prüfen, dann speichern: ein abgelehnter Nachweis soll keine halbe Erfassung hinterlassen.
    authorizeGlobalWrite(actor, "document:write");
    await checkUpload(input.periodId, file);
  }
  return file;
}

export async function createPaymentAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = paymentSchema.parse(formToObject(formData));
    const file = await readProof(actor, formData, input);

    const paymentId = await createPayment(actor, input);
    if (file) await attachProof(actor, paymentId, input, file);
    revalidatePath("/", "layout");
  });
}

export async function updatePaymentAction(
  paymentId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = parseId(paymentId);
    const input = paymentSchema.parse(formToObject(formData));
    const file = await readProof(actor, formData, input);

    await updatePayment(actor, id, input);
    if (file) await attachProof(actor, id, input, file);
    revalidatePath("/", "layout");
  });
}

export async function deletePaymentAction(paymentId: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await deletePayment(actor, parseId(paymentId));
    revalidatePath("/", "layout");
  });
}
