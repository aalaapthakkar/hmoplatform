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
    tenants:
      | (Pick<Tables["tenants"]["Row"], "first_name" | "last_name" | "email" | "phone"> &
          Partial<Pick<Tables["tenants"]["Row"], "id" | "user_id">> & {
            tenant_portal_invites?: Pick<
              Tables["tenant_portal_invites"]["Row"],
              "expires_at" | "used_at" | "revoked_at"
            >[];
          })
      | null;
  })[];
  rent_charges?: Pick<Tables["rent_charges"]["Row"], "amount_pence" | "status">[];
  rent_payments?: Pick<Tables["rent_payments"]["Row"], "amount_pence" | "status">[];
  onboardings?: Pick<Tables["onboardings"]["Row"], "id" | "status">[];
  tenancy_guarantors?: GuarantorRow[];
  signature_requests?: SignatureRequestRow[];
};

export type GuarantorRow = Pick<
  Tables["tenancy_guarantors"]["Row"],
  "id" | "name" | "email" | "phone" | "address" | "status" | "removed_at" | "removed_reason"
>;

export type SignatureRequestRow = Pick<
  Tables["signature_requests"]["Row"],
  | "id"
  | "kind"
  | "status"
  | "provider"
  | "provider_request_id"
  | "sent_at"
  | "completed_at"
  | "cancelled_reason"
  | "signed_document_id"
  | "unsigned_document_id"
> & {
  signature_request_signers: Pick<
    Tables["signature_request_signers"]["Row"],
    "role" | "name" | "email" | "status" | "signed_at" | "signing_order"
  >[];
};

export type TenancyGroup = "upcoming" | "current" | "past";

export type TenancySummary = {
  id: string;
  group: TenancyGroup;
  status: TenancyRow["status"];
  statusLabel: string;
  tenants: {
    id: string | null;
    firstName: string;
    name: string;
    email: string | null;
    phone: string | null;
    portal: PortalAccess;
  }[];
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
  guarantor: GuarantorRow | null;
  removedGuarantors: GuarantorRow[];
  /** Newest first. */
  signatureRequests: SignatureRequestRow[];
  dates: TenancyDates;
  /** Charges minus payments so far, or null when the ledger wasn't loaded. */
  balancePence: number | null;
};

/** Whether a tenant can use the tenant portal. */
export type PortalAccess =
  { state: "joined" } | { state: "invited"; until: string } | { state: "not_invited" };

type InviteRow = Pick<
  Tables["tenant_portal_invites"]["Row"],
  "expires_at" | "used_at" | "revoked_at"
>;

export function portalAccess(
  userId: string | null | undefined,
  invites: InviteRow[] | undefined,
  now: string,
): PortalAccess {
  if (userId) return { state: "joined" };
  const live = (invites ?? [])
    .filter((invite) => !invite.used_at && !invite.revoked_at && invite.expires_at > now)
    .sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0];
  return live ? { state: "invited", until: live.expires_at } : { state: "not_invited" };
}

function balanceOf(row: TenancyRow) {
  if (!row.rent_charges || !row.rent_payments) return null;
  const sum = (entries: { amount_pence: number; status: string }[]) =>
    entries
      .filter((entry) => entry.status === "active")
      .reduce((total, entry) => total + entry.amount_pence, 0);
  return sum(row.rent_charges) - sum(row.rent_payments);
}

const FREQUENCY_LABELS: Record<string, string> = { monthly: "per month", weekly: "per week" };

function groupOf(status: TenancyRow["status"]): TenancyGroup {
  if (status === "prospective") return "upcoming";
  return isCurrent({ status }) ? "current" : "past";
}

export function summariseTenancy(
  row: TenancyRow,
  today: string,
  now = new Date().toISOString(),
): TenancySummary {
  const tenants = row.tenancy_tenants
    .filter((link) => link.status === "active" && link.tenants)
    .map(({ tenants: tenant }) => ({
      id: tenant!.id ?? null,
      firstName: tenant!.first_name,
      name: `${tenant!.first_name} ${tenant!.last_name}`,
      email: tenant!.email,
      phone: tenant!.phone,
      portal: portalAccess(tenant!.user_id, tenant!.tenant_portal_invites, now),
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
    guarantor: row.tenancy_guarantors?.find((guarantor) => guarantor.status === "required") ?? null,
    removedGuarantors:
      row.tenancy_guarantors?.filter((guarantor) => guarantor.status === "removed") ?? [],
    signatureRequests: [...(row.signature_requests ?? [])].sort((a, b) =>
      b.sent_at.localeCompare(a.sent_at),
    ),
    dates: {
      id: row.id,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
    },
    balancePence: balanceOf(row),
  };
}
