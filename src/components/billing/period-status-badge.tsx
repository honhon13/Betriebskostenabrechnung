import { CircleCheck, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PeriodStatus } from "@/types/billing";

export function PeriodStatusBadge({ status }: { status: PeriodStatus }) {
  return status === "released" ? (
    <Badge tone="success" icon={<CircleCheck aria-hidden />}>
      Freigegeben
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<PencilLine aria-hidden />}>
      Entwurf
    </Badge>
  );
}
