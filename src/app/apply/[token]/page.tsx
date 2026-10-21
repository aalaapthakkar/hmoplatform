import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicantPortal } from "@/components/portal/applicant-portal";
import { getPortalOverview } from "@/lib/onboarding/portal";
import { applicationFromJson } from "@/lib/validation/application";

export const metadata: Metadata = {
  title: "Your application",
  robots: { index: false, follow: false },
};

/** The applicant's portal, reached by the secure link staff send them. No account needed. */
export default function ApplyPage({ params }: PageProps<"/apply/[token]">) {
  return (
    <main className="flex flex-1 flex-col items-center bg-muted/40 px-4 py-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
          <Portal params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Portal({ params }: Pick<PageProps<"/apply/[token]">, "params">) {
  const { token } = await params;
  const overview = await getPortalOverview(token);

  if (!overview) {
    return (
      <div
        className="flex flex-col gap-3 rounded-xl border bg-background p-6"
        data-testid="link-invalid"
      >
        <h1 className="text-xl font-semibold">This link isn&apos;t working</h1>
        <p className="text-muted-foreground">
          It may have expired, been replaced with a newer one, or the move-in may be complete. Ask
          the letting agent or landlord who sent it for a new link.
        </p>
      </div>
    );
  }

  return (
    <ApplicantPortal
      token={token}
      overview={overview}
      initialAnswers={applicationFromJson(overview.application)}
    />
  );
}
