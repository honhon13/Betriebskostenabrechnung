"use client";

import {
  Building2,
  Files,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/abrechnung", label: "Abrechnung", icon: ReceiptText },
  { href: "/einzahlungen", label: "Einzahlungen", icon: Wallet },
  { href: "/dokumente", label: "Dokumente", icon: Files },
];

const SETTINGS_NAV: NavItem = { href: "/einstellungen", label: "Einstellungen", icon: Settings };

const itemClass =
  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4.5 [&_svg]:shrink-0";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        active
          ? "bg-primary-soft text-primary"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Icon aria-hidden />
      {item.label}
    </Link>
  );
}

interface AppShellProps {
  user: { displayName: string; roleName: string; unitName: string | null };
  logoutAction: () => Promise<void>;
  children: ReactNode;
}

export function AppShell({ user, logoutAction, children }: AppShellProps) {
  // Nur für das Handy relevant: ab lg ist die Sidebar immer sichtbar.
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Kopfzeile auf dem Handy */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-3 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Navigation öffnen"
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Brand />
      </header>

      {/* Abdunklung hinter der geöffneten Navigation */}
      <div
        onClick={close}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-black/45 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface print:hidden",
          "transition-[translate,visibility] duration-200 lg:translate-x-0",
          // Eingeklappt unsichtbar, damit die Links auf dem Handy nicht per Tab erreichbar sind.
          open ? "translate-x-0" : "-translate-x-full max-lg:invisible",
        )}
      >
        <div className="flex h-14 items-center justify-between px-4 lg:h-16">
          <Brand />
          <button
            type="button"
            onClick={close}
            aria-label="Navigation schließen"
            className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={close} />
          ))}
        </nav>

        <div className="space-y-1 border-t border-border px-3 py-3">
          <div className="px-3 pb-2">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-subtle">
              {[user.unitName, user.roleName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <NavLink item={SETTINGS_NAV} onNavigate={close} />
          <form action={logoutAction}>
            <button
              type="submit"
              className={cn(itemClass, "text-muted hover:bg-surface-muted hover:text-foreground")}
            >
              <LogOut aria-hidden />
              Logout
            </button>
          </form>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg font-semibold">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4.5" aria-hidden />
      </span>
      <span className="truncate">Betriebskosten</span>
    </Link>
  );
}
