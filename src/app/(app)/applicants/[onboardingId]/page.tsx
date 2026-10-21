import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { PortalLinkCard } from "@/components/onboarding/portal-link-card";
import { RightToRentCard } from "@/components/onboarding/right-to-rent-card";
import { WithdrawOnboarding } from "@/components/onboarding/withdraw-onboarding";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";
import { formatUkDate, formatUkDateTime, todayInLondon } from "@/lib/format";
import { applicationRows } from "@/lib/onboarding/application-view";
import { getOnboarding } from "@/lib/onboarding/queries";
import { currentStep, progress } from "@/lib/onboarding/steps";
import { applicationFromJson } from "@/lib/validation/application";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/document";

export const metadata: Metadata = { title: "Onboarding" };

const STATUS_LABELS = {
  in_progress: "In progress",
  completed: "Completed",
  withdrawn: "Withdrawn",
} as const;

export default function OnboardingPage({ params }: PageProps<"/applicants/[onboardingId]">) {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link
        href="/applicants"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Onboarding
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Onboarding params={params} />
      </Suspense>
    </div>
  );
}

async function Onboarding({ params }: Pick<PageProps<"/applicants/[onboardingId]">, "params">) {
  const { onboardingId } = await params;
  const [detail, membership] = await Promise.all([
    getOnboarding(onboardingId),
    requireMembership(),
  ]);
  const { onboarding, tenant, steps, documents, checks, reminders, people } = detail;
  const today = todayInLondon();
  const property = onboarding.rooms?.properties;
  const place = `${onboarding.rooms?.name}, ${property?.address_line_1}`;
  const closed = onboarding.status !== "in_progress";
  const current = currentStep(
    steps.map((step) => ({
      ...step,
      dueDate: step.due_date,
      completedAt: step.completed_at,
    })),
  );
  const { done, total } = progress(steps);
  const answers = applicationRows(applicationFromJson(onboarding.application));
  const liveUntil =
    !closed &&
    !onboarding.portal_revoked_at &&
    onboarding.portal_expires_at &&
    onboarding.portal_expires_at > new Date().toISOString()
      ? onboarding.portal_expires_at
      : null;
  const name = tenant ? `${tenant.first_name} ${tenant.last_name}` : "Applicant";

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <Badge variant={closed ? "secondary" : "default"}>
            {STATUS_LABELS[onboarding.status]}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          <Link
            href={`/properties/${property?.id}/rooms/${onboarding.rooms?.id}?tenancy=${onboarding.tenancies?.id}`}
            className="underline-offset-4 hover:underline"
          >
            {place}
          </Link>
          {property ? `, ${property.postcode}` : ""}
        </p>
        <p className="text-sm text-muted-foreground" data-testid="onboarding-summary">
          Moving in {onboarding.tenancies ? formatUkDate(onboarding.tenancies.start_date) : "–"} ·{" "}
          {done} of {total} steps done
          {onboarding.completed_at ? ` · completed ${formatUkDate(onboarding.completed_at)}` : ""}
        </p>
        {closed ? null : (
          <div>
            <WithdrawOnboarding onboardingId={onboarding.id} />
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <OnboardingSteps
          steps={steps}
          people={people}
          currentStepId={current?.id ?? null}
          closed={closed}
          today={today}
        />

        <div className="flex flex-col gap-4">
          {closed ? null : (
            <PortalLinkCard
              onboardingId={onboarding.id}
              liveUntil={liveUntil}
              applicantFirstName={tenant?.first_name ?? "the applicant"}
              applicantEmail={tenant?.email ?? null}
              place={place}
              organisation={membership.orgName}
            />
          )}

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="font-semibold">Uploaded by the applicant</h2>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm" aria-label="Applicant documents">
                  {documents.map((document) => (
                    <li key={document.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {DOCUMENT_TYPE_LABELS[document.document_type]}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {document.file_name}
                        </span>
                      </span>
                      <a
                        href={`/documents/${document.id}/download`}
                        className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                        aria-label={`Download ${document.file_name}`}
                      >
                        <Download aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {tenant ? (
            <RightToRentCard
              onboardingId={onboarding.id}
              tenantId={tenant.id}
              checks={checks}
              reminders={reminders}
              closed={closed}
              today={today}
            />
          ) : null}
        </div>
      </div>

      <Card data-testid="application-card">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Application</h2>
            <Badge variant="outline">
              {onboarding.application_submitted_at
                ? `Sent ${formatUkDateTime(onboarding.application_submitted_at)}`
                : answers.length > 0
                  ? "Started, not sent yet"
                  : "Not started"}
            </Badge>
          </div>
          {answers.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
              {answers.map((answer) => (
                <div key={answer.label} className="contents">
                  <dt className="text-muted-foreground">{answer.label}</dt>
                  <dd className="break-words">{answer.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              The applicant fills this in through their link.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
