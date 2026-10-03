import type { ReactNode } from "react";

import type { AuditDetails } from "@/lib/audit";

/** Ab so vielen Zeilen klappt die Liste ein – die Tabelle bleibt so überschaubar. */
const INLINE_LIMIT = 3;

function Lines({ label, children }: { label: string; children: ReactNode[] }) {
  const list = <ul className="space-y-0.5">{children}</ul>;
  if (children.length <= INLINE_LIMIT) return list;
  return (
    <details>
      <summary className="cursor-pointer text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        {children.length} {label}
      </summary>
      <div className="mt-1">{list}</div>
    </details>
  );
}

/** Zusatzangaben eines Protokolleintrags: Hinweis, geänderte Felder (vorher → nachher), Werte. */
export function AuditDetailsView({ details }: { details: AuditDetails | null }) {
  const changes = details?.changes ?? [];
  const values = details?.values ?? [];
  if (!details?.note && changes.length === 0 && values.length === 0) {
    return <span className="text-subtle">–</span>;
  }

  return (
    <div className="space-y-1 text-left wrap-anywhere">
      {details?.note ? <p>{details.note}</p> : null}
      {changes.length > 0 ? (
        <Lines label="Änderungen">
          {changes.map((change) => (
            <li key={change.field}>
              <span className="text-muted">{change.field}:</span> {change.from ?? "leer"}
              <span aria-hidden> → </span>
              <span className="sr-only"> geändert zu </span>
              <span className="font-medium">{change.to ?? "leer"}</span>
            </li>
          ))}
        </Lines>
      ) : null}
      {values.length > 0 ? (
        <Lines label="Werte">
          {values.map(({ field, value }) => (
            <li key={field}>
              <span className="text-muted">{field}:</span> {value}
            </li>
          ))}
        </Lines>
      ) : null}
    </div>
  );
}
