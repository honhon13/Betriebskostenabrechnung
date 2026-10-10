"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/auth/current-user";
import { authorize } from "@/auth/rbac";
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-state";
import { DomainError } from "@/lib/errors";
import { formToObject } from "@/lib/form-data";
import { receiptTypeOf } from "@/lib/labels";
import { readUpload } from "@/lib/upload";
import {
  costSubmissionSchema,
  documentMetaSchema,
  parseId,
  paymentSubmissionSchema,
  periodSchema,
  type DocumentMetaInput,
} from "@/lib/validation";
import { checkUpload, type UploadedFile } from "@/services/documents.service";
import {
  submitCost,
  submitDocument,
  submitPayment,
  submitPeriod,
  updateOwnCost,
  updateOwnDocument,
  updateOwnPayment,
} from "@/services/submissions.service";
import type { SessionUser } from "@/types/auth";

// Einreichen durch Benutzer. Alles hier erzeugt Einträge mit „ausstehender Prüfung“ –
// die Rechte- und Eigentumsprüfung liegt im Service.

const NO_INVOICE_DATA = {
  description: null,
  unitId: null,
  categoryId: null,
  documentDate: null,
  supplier: null,
  invoiceNumber: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  netAmount: null,
  taxAmount: null,
  amount: null,
} satisfies Partial<DocumentMetaInput>;

/** Prüft eine mitgeschickte Datei, bevor der eigentliche Eintrag angelegt wird. */
async function readAttachment(actor: SessionUser, formData: FormData, periodId: number) {
  const file = await readUpload(formData);
  if (file) {
    authorize(actor, "document:submit");
    await checkUpload(periodId, file);
  }
  return file;
}

/** Hängt die Datei als eingereichtes Dokument an – auch sie wartet danach auf Prüfung. */
async function attach(
  actor: SessionUser,
  periodId: number,
  file: UploadedFile,
  meta: DocumentMetaInput,
  what: string,
) {
  try {
    await submitDocument(actor, periodId, file, meta);
  } catch (error) {
    revalidatePath("/", "layout");
    const reason = error instanceof DomainError ? ` ${error.message}` : "";
    throw new DomainError(`${what} ist eingereicht, die Datei konnte aber nicht abgelegt werden.${reason}`);
  }
}

export async function submitPeriodAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await submitPeriod(actor, periodSchema.parse(formToObject(formData)));
    revalidatePath("/", "layout");
  });
}

export async function submitCostAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = costSubmissionSchema.parse(formToObject(formData));
    const file = await readAttachment(actor, formData, input.periodId);

    const costId = await submitCost(actor, input);
    if (file) {
      await attach(
        actor,
        input.periodId,
        file,
        {
          ...NO_INVOICE_DATA,
          // Der Beleg zu einer Gutschrift (negativer Betrag) ist eine Gutschrift.
          type: receiptTypeOf(input.amount),
          categoryId: input.categoryId,
          costIds: [costId],
          paymentId: null,
          documentDate: input.costDate,
          supplier: input.supplier,
          invoiceNumber: input.invoiceNumber,
          amount: input.amount,
        },
        "Die Kostenposition",
      );
    }
    revalidatePath("/", "layout");
  });
}

export async function updateOwnCostAction(costId: number, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = parseId(costId);
    const input = costSubmissionSchema.parse(formToObject(formData));
    const file = await readAttachment(actor, formData, input.periodId);

    await updateOwnCost(actor, id, input);
    if (file) {
      await attach(
        actor,
        input.periodId,
        file,
        {
          ...NO_INVOICE_DATA,
          type: receiptTypeOf(input.amount),
          categoryId: input.categoryId,
          costIds: [id],
          paymentId: null,
          documentDate: input.costDate,
          supplier: input.supplier,
          invoiceNumber: input.invoiceNumber,
          amount: input.amount,
        },
        "Die Änderung",
      );
    }
    revalidatePath("/", "layout");
  });
}

export async function submitPaymentAction(formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = paymentSubmissionSchema.parse(formToObject(formData));
    const file = await readAttachment(actor, formData, input.periodId);

    const paymentId = await submitPayment(actor, input);
    if (file) {
      await attach(
        actor,
        input.periodId,
        file,
        {
          ...NO_INVOICE_DATA,
          type: "payment_proof",
          description: input.purpose,
          costIds: [],
          paymentId,
          documentDate: input.paymentDate,
          amount: input.amount,
        },
        "Die Einzahlung",
      );
    }
    revalidatePath("/", "layout");
  });
}

export async function updateOwnPaymentAction(
  paymentId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const id = parseId(paymentId);
    const input = paymentSubmissionSchema.parse(formToObject(formData));
    const file = await readAttachment(actor, formData, input.periodId);

    await updateOwnPayment(actor, id, input);
    if (file) {
      await attach(
        actor,
        input.periodId,
        file,
        {
          ...NO_INVOICE_DATA,
          type: "payment_proof",
          description: input.purpose,
          costIds: [],
          paymentId: id,
          documentDate: input.paymentDate,
          amount: input.amount,
        },
        "Die Änderung",
      );
    }
    revalidatePath("/", "layout");
  });
}

export async function updateOwnDocumentAction(
  documentId: number,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    const meta = documentMetaSchema.parse(formToObject(formData, ["costIds"]));
    await updateOwnDocument(actor, parseId(documentId), meta);
    revalidatePath("/", "layout");
  });
}
