import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentMembership } from "@/lib/auth/session";
import { HOME_ROUTE } from "@/lib/routes";
import { createOrganisation } from "./actions";

export const metadata: Metadata = { title: "Set up your organisation" };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <p className="text-lg font-semibold tracking-tight">HMO Platform</p>
      <Suspense>
        <RedirectIfOnboarded />
      </Suspense>
      <AuthCard
        title="Name your organisation"
        description="This is the business name your team, tenants and owners will see. You can change it later."
      >
        <AuthForm
          action={createOrganisation}
          fields={[
            {
              name: "name",
              label: "Organisation name",
              type: "text",
              autoComplete: "organization",
              hint: "For example, Northside Lettings Ltd.",
            },
          ]}
          submitLabel="Continue"
          pendingLabel="Setting up…"
        />
      </AuthCard>
    </main>
  );
}

async function RedirectIfOnboarded() {
  const membership = await getCurrentMembership();
  if (membership) redirect(HOME_ROUTE);
  return null;
}
