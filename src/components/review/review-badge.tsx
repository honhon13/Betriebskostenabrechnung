import { CircleCheck, CircleX, Hourglass } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { REVIEW_STATUS_LABELS } from "@/lib/labels";
import type { ReviewStatus } from "@/types/billing";

/** Prüfstand eines eingereichten Eintrags – immer mit Symbol und Wort. */
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const label = REVIEW_STATUS_LABELS[status];
  if (status === "approved") {
    return (
      <Badge tone="success" icon={<CircleCheck aria-hidden />}>
        {label}
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge tone="danger" icon={<CircleX aria-hidden />}>
        {label}
      </Badge>
    );
  }
  return (
    <Badge tone="warning" icon={<Hourglass aria-hidden />}>
      {label}
    </Badge>
  );
}

/**
 * Markierung in den Listen der Verwaltung: nur für Einträge, die (noch) nicht offiziell
 * zählen. Freigegebenes ist der Normalfall und bekommt keine Markierung.
 */
export function ReviewFlag({ status }: { status: ReviewStatus }) {
  return status === "approved" ? null : <ReviewBadge status={status} />;
}
