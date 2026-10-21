import { z } from "zod";
import { formatUkDate, todayInLondon } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { currentStep, daysStuck, isOverdue, progress } from "./steps";

type Tables = Database["public"]["Tables"];

/** Every onboarding as the Onboarding list selects it. */
export type OnboardingListRow = Pick<
  Tables["onboardings"]["Row"],
  "id" | "status" | "created_at" | "completed_at"
> & {
  rooms: { name: string; properties: { address_line_1: string } | null } | null;
  tenancies: {
    start_date: string;
    tenancy_tenants: {
      status: Tables["tenancy_tenants"]["Row"]["status"];
      tenants: { first_name: string; last_name: string } | null;
    }[];
  } | null;
  onboarding_steps: Pick<
    Tables["onboarding_steps"]["Row"],
    | "position"
    | "title"
    | "status"
    | "owner_user_id"
    | "owner_is_applicant"
    | "due_date"
    | "completed_at"
  >[];
};

export const ONBOARDING_FILTERS = {
  all: "In progress",
  overdue: "Overdue",
  applicant: "Waiting on applicant",
  mine: "Mine",
  closed: "Completed or withdrawn",
} as const;
export type OnboardingFilter = keyof typeof ONBOARDING_FILTERS;

export const onboardingFilterSchema = z
  .enum(Object.keys(ONBOARDING_FILTERS) as [OnboardingFilter, ...OnboardingFilter[]])
  .catch("all");

export type OnboardingListItem = {
  id: string;
  applicant: string;
  place: string;
  moveIn: string;
  moveInDate: string;
  status: OnboardingListRow["status"];
  /** The step it's waiting on, or null once everything's done. */
  step: string | null;
  owner: string;
  waitingOnApplicant: boolean;
  mine: boolean;
  due: string | null;
  overdue: boolean;
  daysStuck: number;
  progress: string;
};

const londonDate = (instant: string) => todayInLondon(new Date(instant));

export function buildOnboardingList(
  rows: OnboardingListRow[],
  people: { id: string; name: string }[],
  me: string,
  today: string,
): OnboardingListItem[] {
  return rows.map((row) => {
    const steps = row.onboarding_steps.map((step) => ({
      ...step,
      dueDate: step.due_date,
      completedAt: step.completed_at,
    }));
    const step = row.status === "in_progress" ? currentStep(steps) : null;
    const tenant = row.tenancies?.tenancy_tenants.find((link) => link.status === "active")?.tenants;
    const { done, total } = progress(steps);

    return {
      id: row.id,
      applicant: tenant ? `${tenant.first_name} ${tenant.last_name}` : "Applicant",
      place: [row.rooms?.name, row.rooms?.properties?.address_line_1].filter(Boolean).join(", "),
      moveIn: row.tenancies ? formatUkDate(row.tenancies.start_date) : "",
      moveInDate: row.tenancies?.start_date ?? "",
      status: row.status,
      step: step?.title ?? null,
      owner: !step
        ? ""
        : step.owner_is_applicant
          ? "Applicant"
          : (people.find((person) => person.id === step.owner_user_id)?.name ?? "Nobody yet"),
      waitingOnApplicant: step?.owner_is_applicant ?? false,
      mine: step?.owner_user_id === me,
      due: step?.due_date ? formatUkDate(step.due_date) : null,
      overdue: step ? isOverdue(step, today) : false,
      daysStuck: step ? daysStuck(steps, londonDate(row.created_at), today, londonDate) : 0,
      progress: `${done} of ${total}`,
    };
  });
}

/** Filters the list; overdue first, then the longest stuck, then the soonest move-in. */
export function filterOnboardingList(items: OnboardingListItem[], filter: OnboardingFilter) {
  const matching = items.filter((item) => {
    if (filter === "closed") return item.status !== "in_progress";
    if (item.status !== "in_progress") return false;
    if (filter === "overdue") return item.overdue;
    if (filter === "applicant") return item.waitingOnApplicant;
    if (filter === "mine") return item.mine;
    return true;
  });
  return matching.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      b.daysStuck - a.daysStuck ||
      a.moveInDate.localeCompare(b.moveInDate),
  );
}
