import { FileQuestion } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={FileQuestion}
        title="Seite nicht gefunden"
        description="Die Seite existiert nicht oder ist für dich nicht freigegeben."
      >
        <ButtonLink href="/dashboard">Zum Dashboard</ButtonLink>
      </EmptyState>
    </main>
  );
}
