import { Building2 } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-6" aria-hidden />
          </span>
          <p className="mt-3 text-lg font-semibold">Betriebskostenabrechnung</p>
          <p className="text-sm text-muted">TOP 1–3</p>
        </div>
        {children}
      </div>
    </main>
  );
}
