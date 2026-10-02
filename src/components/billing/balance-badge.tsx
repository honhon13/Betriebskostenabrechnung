import { CircleCheck, CircleMinus, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Saldo = Einzahlungen minus Kostenanteil. Immer mit Symbol und Wort, nie nur Farbe. */
export function BalanceBadge({ cents }: { cents: number }) {
  if (cents > 0) {
    return (
      <Badge tone="success" icon={<CircleCheck aria-hidden />}>
        Guthaben
      </Badge>
    );
  }
  if (cents < 0) {
    return (
      <Badge tone="warning" icon={<TriangleAlert aria-hidden />}>
        Offen
      </Badge>
    );
  }
  return (
    <Badge icon={<CircleMinus aria-hidden />}>
      Ausgeglichen
    </Badge>
  );
}

export function balanceLabel(cents: number): string {
  return cents > 0 ? "Guthaben" : cents < 0 ? "Offener Betrag" : "Saldo";
}
