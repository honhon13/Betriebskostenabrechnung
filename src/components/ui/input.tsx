import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// text-base auf dem Handy verhindert, dass iOS beim Fokussieren hineinzoomt.
const control =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground sm:text-sm " +
  "placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(control, "py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("size-4 shrink-0 rounded border-border-strong accent-primary", className)}
      {...props}
    />
  );
}
