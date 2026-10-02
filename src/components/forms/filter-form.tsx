"use client";

import Form from "next/form";
import type { ReactNode } from "react";

interface FilterFormProps {
  /** Zielpfad – die Felder des Formulars landen als Query-Parameter in der URL. */
  action: string;
  children: ReactNode;
  className?: string;
}

/**
 * Filterleiste: Auswahlfelder wirken sofort, das Suchfeld beim Absenden.
 * Der Zustand liegt vollständig in der URL und lässt sich so teilen und neu laden.
 */
export function FilterForm({ action, children, className }: FilterFormProps) {
  return (
    <Form
      action={action}
      className={className}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </Form>
  );
}
