import { FileMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Kennzeichnet eine Gutschrift – eine Position mit negativem Betrag. Sie mindert die Kosten und
 * steht in Summen und Auswertungen getrennt von den Kostenpositionen.
 */
export function CreditBadge({ className }: { className?: string }) {
  return (
    <Badge tone="primary" icon={<FileMinus aria-hidden />} className={className}>
      Gutschrift
    </Badge>
  );
}
