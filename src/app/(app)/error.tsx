"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title="Das hat leider nicht geklappt"
      description="Beim Laden der Seite ist ein Fehler aufgetreten. Bitte versuche es erneut."
    >
      <Button onClick={reset}>Erneut versuchen</Button>
    </EmptyState>
  );
}
