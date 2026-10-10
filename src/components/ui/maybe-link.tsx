import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { inlineLinkClass } from "./interactive";

interface MaybeLinkProps {
  /** Ziel – ohne Angabe (z. B. weil der Rolle das Recht fehlt) bleibt es bei schlichtem Text. */
  href: string | undefined;
  title?: string;
  className?: string;
  children: ReactNode;
}

/** Text, der zu einer anderen Ansicht führt, sofern es für den Benutzer eine gibt. */
export function MaybeLink({ href, title, className, children }: MaybeLinkProps) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} title={title} className={cn(inlineLinkClass, className)}>
      {children}
    </Link>
  );
}
