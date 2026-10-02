import { CircleAlert, CircleCheck, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { OcrStatus } from "@/types/billing";

/**
 * OCR-Status eines Dokuments: offen (noch nicht ausgelesen), verarbeitet oder Fehler.
 * Immer mit Symbol und Wort; bei einem Fehler steht der Grund im Tooltip.
 */
export function OcrStatusBadge({ status, error }: { status: OcrStatus; error?: string | null }) {
  if (status === "done") {
    return (
      <Badge tone="success" icon={<CircleCheck aria-hidden />}>
        Verarbeitet
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <span title={error ?? undefined}>
        <Badge tone="danger" icon={<CircleAlert aria-hidden />}>
          Fehler
        </Badge>
      </span>
    );
  }
  return <Badge icon={<Clock aria-hidden />}>Offen</Badge>;
}
