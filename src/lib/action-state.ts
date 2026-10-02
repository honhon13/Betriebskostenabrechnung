/** Rückgabewert aller Server Actions – wird von useActionState in den Formularen gelesen. */
export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

export const initialActionState: ActionState = null;
