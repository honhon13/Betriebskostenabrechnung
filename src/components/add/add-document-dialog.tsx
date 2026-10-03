"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  DocumentUploadDialog,
  type DocumentUploadProps,
} from "@/components/documents/document-upload";

import { useAddDialog } from "./add-menu";

interface AddDocumentDialogProps extends DocumentUploadProps {
  /** Seite, auf der die hochgeladenen Dokumente stehen – siehe `AddFormDialog`. */
  listHref?: string;
}

/** Dokument-Upload als „Hinzufügen“-Aktion. */
export function AddDocumentDialog({ listHref, ...props }: AddDocumentDialogProps) {
  const { close } = useAddDialog();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <DocumentUploadDialog
      {...props}
      onClose={(uploaded) => {
        close();
        if (uploaded > 0 && listHref && pathname !== listHref) router.push(listHref);
      }}
    />
  );
}
