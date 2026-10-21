import { formatPence, formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { END_REASON_LABELS } from "@/lib/validation/tenancy";
import { dueDayLabel, isCurrent, TENANCY_STATUS_LABELS, type TenancyDates } from "./status";

type Tables = Database["public"]["Tables"];

/** A tenancy as the room page selects it, with its tenants. */
export type TenancyRow = Pick<
  Tables["tenancies"]["Row"],
  | "id"
  | "status"
  | "start_date"
  | "end_date"
  | "notice_date"
  | "end_reason"
  | "rent_pence"
  | "rent_frequency"
  | "rent_due_day"
  | "deposit_pence"
> & {
  tenancy_tenants: (Pick<Tables["tenancy_tenants"]["Row"], "status"> & {
    tenants: Pick<Tables["tenants"]["Row"], "first_name" | "last_name" | "email" | "phone"> | null;
  })[];
  onboardings?: Pick<Tables["onboardings"]["Row"], "id" | "status">[];
};

export type TenancyGroup = "upcoming" | "current" | "past";

export type TenancySummary = {
  id: string;
  group: TenancyGroup;
  status: TenancyRow["status"];
  statusLabel: string;
  tenants: { name: string; email: string | null; phone: string | null }[];
  /** "Priya Shah", or "Priya Shah and Tom Walsh". */
  tenantNames: string;
  start: string;
  end: string | null;
  notice: string | null;
  endReason: string | null;
  rent: string;
  dueDay: string;
  deposit: string;
  /** What the switcher shows, e.g. "since 01/09/2026". */
  when: string;
  /** Upcoming and the start date has come. */
  canMoveIn: boolean;
  /** Notice given and the end date has come: time to confirm they've left. */
  canMarkEnded: boolean;
  /** The onboarding in progress for this tenancy, if any. */
  onboardingId: string | null;
  dates: TenancyDates;
};

const FREQUENCY_LABELS: Record<string, string> = { monthly: "per month", weekly: "per week" };

function groupOf(status: TenancyRow["status"]): TenancyGroup {
  if (status === "prospective") return "upcoming";
  return isCurrent({ status }) ? "current" : "past";
}

export function summariseTenancy(row: TenancyRow, today: string): TenancySummary {
  const tenants = row.tenancy_tenants
    .filter((link) => link.status === "active" && link.tenants)
    .map(({ tenants: tenant }) => ({
      name: `${tenant!.first_name} ${tenant!.last_name}`,
      email: tenant!.email,
      phone: tenant!.phone,
    }));
  const start = formatUkDate(row.start_date);
  const end = row.end_date ? formatUkDate(row.end_date) : null;
  const group = groupOf(row.status);

  return {
    id: row.id,
    group,
    status: row.status,
    statusLabel: TENANCY_STATUS_LABELS[row.status],
    tenants,
    tenantNames: tenants.map((tenant) => tenant.name).join(" and ") || "No tenant recorded",
    start,
    end,
    notice: row.notice_date ? formatUkDate(row.notice_date) : null,
    endReason: row.end_reason ? END_REASON_LABELS[row.end_reason] : null,
    rent: `${formatPence(row.rent_pence)} ${FREQUENCY_LABELS[row.rent_frequency] ?? ""}`.trim(),
    dueDay: dueDayLabel(row.rent_frequency, row.rent_due_day),
    deposit: formatPence(row.deposit_pence),
    when:
      row.status === "prospective"
        ? `from ${start}`
        : row.status === "cancelled"
          ? `cancelled, was due ${start}`
          : end && row.status === "ended"
            ? `${start} to ${end}`
            : end
              ? `leaving ${end}`
              : `since ${start}`,
    canMoveIn: row.status === "prospective" && row.start_date <= today,
    canMarkEnded: row.status === "ending" && row.end_date !== null && row.end_date <= today,
    onboardingId:
      row.onboardings?.find((onboarding) => onboarding.status === "in_progress")?.id ?? null,
    dates: {
      id: row.id,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
    },
  };
}
