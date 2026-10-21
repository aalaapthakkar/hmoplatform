import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { logOut } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { looksLikePortalToken } from "@/lib/onboarding/portal-token";
import { createClient } from "@/lib/supabase/server";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { acceptInvite, joinWithLogIn, joinWithNewAccount } from "./actions";

export const metadata: Metadata = {
  title: "Join your tenant portal",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/portal/join/[token]">;

const inviteSchema = z.object({
  organisation: z.string(),
  firstName: z.string(),
  email: z.string().nullable(),
});

export default function JoinPortalPage({ params, searchParams }: Props) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <Suspense
        fallback={<div className="h-80 w-full max-w-sm animate-pulse rounded-xl bg-muted" />}
      >
        <Join params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Join({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  if (!looksLikePortalToken(token)) return <InvalidInvite />;

  const supabase = await createClient();
  const [{ data, error }, { data: claims }] = await Promise.all([
    supabase.rpc("tenant_invite_info", { p_token: token }),
    supabase.auth.getClaims(),
  ]);
  const invite = inviteSchema.safeParse(data);
  if (error || !invite.success) return <InvalidInvite />;
  const { organisation, firstName, email } = invite.data;
  const signedInAs = claims?.claims?.email;

  return (
    <>
      <p className="text-lg font-semibold tracking-tight">{organisation}</p>
      {claims?.claims ? (
        <AuthCard
          title={`Welcome, ${firstName}`}
          description={`Join ${organisation}'s tenant portal to see your rent, documents and repairs, and to message the team.`}
          footer={
            <form action={logOut}>
              <Button type="submit" variant="link" className="h-auto p-0">
                Not {typeof signedInAs === "string" ? signedInAs : "you"}? Log out
              </Button>
            </form>
          }
        >
          <AuthForm
            action={acceptInvite.bind(null, token)}
            fields={[]}
            submitLabel="Join the portal"
            pendingLabel="Joining…"
          />
        </AuthCard>
      ) : query.login === "1" ? (
        <AuthCard
          title={`Welcome back, ${firstName}`}
          description="Log in to add this tenancy to your portal."
          footer={
            <Link href={`/portal/join/${token}`} className="underline underline-offset-4">
              I&apos;m new here
            </Link>
          }
        >
          <AuthForm
            action={joinWithLogIn.bind(null, token)}
            fields={[
              {
                name: "email",
                label: "Email",
                type: "email",
                autoComplete: "email",
                defaultValue: email ?? undefined,
              },
              {
                name: "password",
                label: "Password",
                type: "password",
                autoComplete: "current-password",
              },
            ]}
            submitLabel="Log in and join"
            pendingLabel="Joining…"
          />
        </AuthCard>
      ) : (
        <AuthCard
          title={`Welcome, ${firstName}`}
          description={`Set a password for ${organisation}'s tenant portal. You'll see your rent, documents and repairs, and can message the team.`}
          footer={
            <Link href={`/portal/join/${token}?login=1`} className="underline underline-offset-4">
              I already have a login
            </Link>
          }
        >
          <AuthForm
            action={joinWithNewAccount.bind(null, token)}
            fields={[
              {
                name: "email",
                label: "Email",
                type: "email",
                autoComplete: "email",
                defaultValue: email ?? undefined,
              },
              {
                name: "password",
                label: "Choose a password",
                type: "password",
                autoComplete: "new-password",
                hint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
              },
            ]}
            submitLabel="Join the portal"
            pendingLabel="Joining…"
          />
        </AuthCard>
      )}
    </>
  );
}

function InvalidInvite() {
  return (
    <AuthCard
      title="This invite isn't valid any more"
      description="Invites work once and only for 14 days. Ask your letting team to send you a new one."
      footer={
        <Link href="/log-in" className="underline underline-offset-4">
          Already joined? Log in
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">
        If you&apos;ve joined before, log in to see your portal.
      </p>
    </AuthCard>
  );
}
