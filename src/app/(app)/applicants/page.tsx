import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import {
  buildOnboardingList,
  filterOnboardingList,
  ONBOARDING_FILTERS,
  type OnboardingFilter,
  onboardingFilterSchema,
  type OnboardingListItem,
  type OnboardingListRow,
} from "@/lib/onboarding/list";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Onboarding" };

export default function ApplicantsPage({ searchParams }: PageProps<"/applicants">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground">
          New tenants on their way in, and where each one is up to.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Onboardings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const LIST_COLUMNS = `
  id, status, created_at, completed_at,
  rooms (name, properties (address_line_1)),
  tenancies (start_date, tenancy_tenants (status, tenants (first_name, last_name))),
  onboarding_steps (position, title, status, owner_user_id, owner_is_applicant, due_date, completed_at)
`;

async function Onboardings({ searchParams }: Pick<PageProps<"/applicants">, "searchParams">) {
  const [membership, user, params] = await Promise.all([
    requireMembership(),
    getCurrentUser(),
    searchParams,
  ]);
  const filter = onboardingFilterSchema.parse(
    Array.isArray(params.show) ? params.show[0] : params.show,
  );

  const supabase = await createClient();
  const [list, people] = await Promise.all([
    supabase
      .from("onboardings")
      .select(LIST_COLUMNS)
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false })
      .limit(500)
      .overrideTypes<OnboardingListRow[], { merge: false }>(),
    supabase.rpc("org_people", { p_org_id: membership.orgId }),
  ]);
  if (list.error || people.error) {
    throw new Error("Could not load onboarding", {
      cause: list.error?.code ?? people.error?.code,
    });
  }

  const all = buildOnboardingList(list.data, people.data, user.id, todayInLondon());
  const items = filterOnboardingList(all, filter);
  const inProgress = all.filter((item) => item.status === "in_progress");
  const counts: Record<OnboardingFilter, number> = {
    all: inProgress.length,
    overdue: inProgress.filter((item) => item.overdue).length,
    applicant: inProgress.filter((item) => item.waitingOnApplicant).length,
    mine: inProgress.filter((item) => item.mine).length,
    closed: all.length - inProgress.length,
  };

  return (
    <>
      <nav aria-label="Show" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max rounded-lg border p-0.5">
          {(Object.keys(ONBOARDING_FILTERS) as OnboardingFilter[]).map((key) => (
            <li key={key}>
              <Link
                href={key === "all" ? "/applicants" : `/applicants?show=${key}`}
                aria-current={filter === key ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors hover:bg-muted",
                  filter === key && "bg-muted font-medium",
                )}
              >
                {ONBOARDING_FILTERS[key]} ({counts[key]})
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {all.length === 0
            ? "No onboarding yet. Start one from an upcoming tenancy on a room."
            : "Nothing here right now."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Applicant
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Moving in
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Waiting on
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Owner
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Due
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Stuck for
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t" data-testid="onboarding-row">
                    <td className="px-4 py-2">
                      <ApplicantLink item={item} />
                    </td>
                    <td className="px-4 py-2">{item.moveIn}</td>
                    <td className="px-4 py-2">
                      <StepLabel item={item} />
                    </td>
                    <td className="px-4 py-2">{item.owner || "–"}</td>
                    <td className="px-4 py-2">
                      <Due item={item} />
                    </td>
                    <td className="px-4 py-2">{item.step ? stuckLabel(item.daysStuck) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden" aria-label="Onboarding">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 rounded-xl border p-4 text-sm">
                <ApplicantLink item={item} />
                <p className="text-muted-foreground">Moving in {item.moveIn}</p>
                <StepLabel item={item} />
                {item.step ? (
                  <p className="text-muted-foreground">
                    {item.owner} · waiting{" "}
                    {item.daysStuck === 0 ? "since today" : stuckLabel(item.daysStuck)}
                    {item.due ? " · due " : ""}
                    {item.due ? <Due item={item} /> : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function stuckLabel(days: number) {
  return days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
}

function ApplicantLink({ item }: { item: OnboardingListItem }) {
  return (
    <Link
      href={`/applicants/${item.id}`}
      className="flex flex-col underline-offset-4 hover:underline"
    >
      <span className="font-medium">{item.applicant}</span>
      <span className="text-xs text-muted-foreground">{item.place}</span>
    </Link>
  );
}

function StepLabel({ item }: { item: OnboardingListItem }) {
  if (!item.step) {
    return (
      <Badge variant="secondary">{item.status === "withdrawn" ? "Withdrawn" : "Completed"}</Badge>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {item.step}
      <span className="text-xs text-muted-foreground">({item.progress} done)</span>
    </span>
  );
}

function Due({ item }: { item: OnboardingListItem }) {
  if (!item.due) return <>–</>;
  return item.overdue ? (
    <Badge className="bg-destructive text-white">Overdue {item.due}</Badge>
  ) : (
    <>{item.due}</>
  );
}
