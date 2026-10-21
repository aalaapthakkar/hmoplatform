import type { Database } from "@/lib/supabase/database.types";

type StepStatus = Database["public"]["Enums"]["onboarding_step_status"];

export type StepLike = {
  position: number;
  status: StepStatus;
  dueDate: string | null;
  completedAt: string | null;
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  not_started: "To do",
  in_progress: "In progress",
  done: "Done",
  skipped: "Skipped",
};

const finished = (step: Pick<StepLike, "status">) =>
  step.status === "done" || step.status === "skipped";

/** The first step, in order, that isn't done or skipped. */
export function currentStep<T extends StepLike>(steps: T[]): T | null {
  return [...steps].sort((a, b) => a.position - b.position).find((step) => !finished(step)) ?? null;
}

export function isOverdue(step: Pick<StepLike, "status" | "dueDate">, today: string) {
  return !finished(step) && step.dueDate !== null && step.dueDate < today;
}

/** Whole days between two "YYYY-MM-DD" dates. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * How many days the onboarding has been waiting on its current step: since
 * the latest earlier step was finished, or since the onboarding started.
 */
export function daysStuck(
  steps: StepLike[],
  startedOn: string,
  today: string,
  toLondonDate: (instant: string) => string,
): number {
  const current = currentStep(steps);
  if (!current) return 0;
  const finishedBefore = steps
    .filter((step) => step.position < current.position && step.completedAt)
    .map((step) => toLondonDate(step.completedAt!))
    .sort();
  const since = finishedBefore.at(-1) ?? startedOn;
  return Math.max(0, daysBetween(since, today));
}

export function progress(steps: Pick<StepLike, "status">[]) {
  return { done: steps.filter(finished).length, total: steps.length };
}

/** What the applicant sees for each step in their portal. */
export function applicantStepLabel(status: StepStatus, yours: boolean) {
  if (status === "done") return "Done";
  if (status === "skipped") return "Not needed";
  if (yours) return status === "in_progress" ? "Started" : "Your turn";
  return status === "in_progress" ? "In progress" : "Coming up";
}
