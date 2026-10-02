/**
 * FormData → einfaches Objekt für die zod-Schemas. Felder in `arrays` werden
 * immer als Liste gelesen (Mehrfachauswahl, Checkbox-Gruppen), auch wenn leer.
 */
export function formToObject(
  formData: FormData,
  arrays: string[] = [],
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const result: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(formData.keys())) {
    if (!arrays.includes(key)) result[key] = formData.get(key)!;
  }
  for (const key of arrays) result[key] = formData.getAll(key);
  return result;
}

/** Nur interne Pfade als Sprungziel zulassen – verhindert Open Redirects nach dem Login. */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^\/(?![/\\])[\w\-./?=&%]*$/.test(value) ? value : fallback;
}
