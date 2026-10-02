import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const styles: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-border bg-surface-muted text-foreground", icon: <Info /> },
  success: { box: "border-success/30 bg-success-soft text-foreground", icon: <CircleCheck /> },
  warning: { box: "border-warning/30 bg-warning-soft text-foreground", icon: <TriangleAlert /> },
  danger: { box: "border-danger/30 bg-danger-soft text-foreground", icon: <CircleAlert /> },
};

interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function Alert({ tone = "info", title, children, className }: AlertProps) {
  const style = styles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border px-3 py-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        style.box,
        className,
      )}
    >
      {style.icon}
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted">{children}</div> : null}
      </div>
    </div>
  );
}
