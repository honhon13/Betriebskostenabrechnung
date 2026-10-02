"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface TabItem {
  href: string;
  label: string;
}

/** Unternavigation eines Bereichs. Der erste Eintrag ist die Startseite des Bereichs. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const pathname = usePathname();
  // Der längste passende Pfad gewinnt, damit die Startseite nicht immer aktiv ist.
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item === active ? "page" : undefined}
              className={cn(
                "-mb-px flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                item === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
