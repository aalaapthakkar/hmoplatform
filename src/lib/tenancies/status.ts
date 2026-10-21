import { formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

export type TenancyStatus = Database["public"]["Enums"]["tenancy_status"];

/** Just what the rules need to know about a tenancy. */
export type TenancyDates = {
  id: string;
  status: TenancyStatus;
  startDate: string;
  endDate: string | null;
};

export const TENANCY_STATUS_LABELS: Record<TenancyStatus, string> = {
  prospective: "Upcoming",
  active: "Current",
  ending: "Notice given",
  ended: "Ended",
  cancelled: "Cancelled",
};

export const isCurrent = (tenancy: Pick<TenancyDates, "status">) =>
  tenancy.status === "active" || tenancy.status === "ending";

/** A tenancy starting after today is upcoming; today or earlier, it's current. */
export function statusForStart(startDate: string, today: string): "prospective" | "active" {
  return startDate > today ? "prospective" : "active";
}

/** A room's tenancies, split the way the room page shows them. Past ones newest first. */
export function groupTenancies<T extends TenancyDates>(tenancies: T[]) {
  return {
    current: tenancies.find(isCurrent) ?? null,
    upcoming: tenancies.find((tenancy) => tenancy.status === "prospective") ?? null,
    past: tenancies
      .filter((tenancy) => tenancy.status === "ended" || tenancy.status === "cancelled")
      .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0)),
  };
}

/**
 * Whether a new tenancy starting on startDate can be added to the room, with
 * the reason if not. Mirrors create_tenancy in the database: at most one
 * current and one upcoming tenancy per room.
 */
export function canAddTenancy(
  tenancies: TenancyDates[],
  startDate: string,
  today: string,
): { ok: true; status: "prospective" | "active" } | { ok: false; message: string } {
  const { current, upcoming } = groupTenancies(tenancies);
  const status = statusForStart(startDate, today);

  if (status === "active" && current) {
    return {
      ok: false,
      message:
        "This room already has a current tenancy. Give the new one a start date in the future, or end the current tenancy first.",
    };
  }
  if (status === "prospective" && upcoming) {
    return {
      ok: false,
      message: "This room already has an upcoming tenancy. Cancel it before adding another.",
    };
  }
  if (status === "prospective" && current?.endDate && startDate < current.endDate) {
    return {
      ok: false,
      message: `The current tenancy ends on ${formatUkDate(current.endDate)}. Choose a start date on or after that day.`,
    };
  }
  return { ok: true, status };
}

/** Whether there's any room for another tenancy (a current or an upcoming one). */
export function hasSpaceForTenancy(tenancies: TenancyDates[]): boolean {
  return groupTenancies(tenancies).upcoming === null;
}

/** The tenancy the room page shows first: current, then upcoming, then the latest past one. */
export function defaultTenancyId(tenancies: TenancyDates[]): string | null {
  const { current, upcoming, past } = groupTenancies(tenancies);
  return (current ?? upcoming ?? past[0])?.id ?? null;
}

/**
 * When a room is (or will be) free: "now" if nobody lives there, the end
 * date if notice has been given, or null if it's let with no end in sight.
 */
export function vacancyDate(tenancies: TenancyDates[]): "now" | string | null {
  const { current } = groupTenancies(tenancies);
  if (!current) return "now";
  return current.status === "ending" ? current.endDate : null;
}

const WEEKDAYS = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

function ordinal(day: number) {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

/** "1st of the month", "31st of the month (or the last day)" or "Mondays". */
export function dueDayLabel(frequency: string, day: number): string {
  if (frequency === "weekly") return WEEKDAYS[day - 1] ?? "";
  return day > 28
    ? `${ordinal(day)} of the month (or the last day)`
    : `${ordinal(day)} of the month`;
}
