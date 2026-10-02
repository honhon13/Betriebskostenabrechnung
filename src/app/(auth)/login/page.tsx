import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/current-user";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    <Card>
      <CardContent>
        <h1 className="text-lg font-semibold">Anmelden</h1>
        <p className="mt-1 mb-5 text-sm text-muted">Mit Benutzername und Passwort.</p>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </CardContent>
    </Card>
  );
}
