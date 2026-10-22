"use server";

import { z } from "zod";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import { describePayment } from "@/lib/rent/ledger";
import { getOrgLedgers } from "@/lib/rent/org-ledgers";
import { getStatement } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";
import { dateField } from "@/lib/validation/dates";
import { poundsField } from "@/lib/validation/property";

export type PaymentTarget = {
  tenancyId: string;
  tenantNames: string;
  place: string;
  balancePence: number;
  arrearsPence: number;
};

/** Tenancies rent can be logged against, for the Log rent picker: paying ones first. */
export async function paymentTargets(): Promise<PaymentTarget[]> {
  const membership = await requireMembership();
  const ledgers = await getOrgLedgers(membership.orgId);
  return [...ledgers]
    .sort(
      (a, b) =>
        Number(a.status === "ended") - Number(b.status === "ended") ||
        b.ledger.arrearsPence - a.ledger.arrearsPence ||
        a.tenantNames.localeCompare(b.tenantNames),
    )
    .map((entry) => ({
      tenancyId: entry.tenancyId,
      tenantNames: entry.tenantNames,
      place: [entry.roomName, entry.propertyLabel].filter(Boolean).join(", "),
      balancePence: entry.ledger.balancePence,
      arrearsPence: entry.ledger.arrearsPence,
    }));
}

export type LogRentValues = {
  paidOn: string;
  amount: string;
  method: string;
  reference: string;
};

const logRentSchema = z.object({
  tenancyId: z.uuid("Choose who paid"),
  paidOn: dateField("date it was paid").refine(
    (date) => date <= todayInLondon(),
    "That date is in the future",
  ),
  amount: poundsField("amount"),
  method: z.enum(
    ["bank_transfer", "standing_order", "card", "cash", "other"],
    "Choose how it was paid",
  ),
  reference: z
    .string()
    .trim()
    .max(100, "Use 100 characters or fewer")
    .transform((value) => value || null),
  /** Log it even though the same payment seems to be on the ledger already. */
  allowDuplicate: z.boolean().default(false),
});

export type LogRentResult =
  | { status: "success"; message: string; tenancyId: string }
  | { status: "duplicate"; message: string }
  | { status: "error"; message: string };

/**
 * Logs money received against a tenancy. Warns first when the same amount
 * on the same day is already on the ledger, and says how the payment was
 * allocated (oldest charges first).
 */
export async function logRent(input: unknown): Promise<LogRentResult> {
  const parsed = logRentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const { tenancyId, paidOn, amount, method, reference, allowDuplicate } = parsed.data;
  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();

  if (!allowDuplicate) {
    const { data: same } = await supabase
      .from("rent_payments")
      .select("id")
      .eq("tenancy_id", tenancyId)
      .eq("paid_on", paidOn)
      .eq("amount_pence", amount)
      .is("reverses_payment_id", null);
    const ids = (same ?? []).map((row) => row.id);
    if (ids.length > 0) {
      const { data: reversed } = await supabase
        .from("rent_payments")
        .select("reverses_payment_id")
        .in("reverses_payment_id", ids);
      if ((reversed ?? []).length < ids.length) {
        return {
          status: "duplicate",
          message:
            "This looks like a payment you've already logged: same tenant, amount and date. Log it anyway?",
        };
      }
    }
  }

  const { data, error } = await supabase
    .from("rent_payments")
    .insert({
      org_id: membership.orgId,
      tenancy_id: tenancyId,
      paid_on: paidOn,
      amount_pence: amount,
      method,
      reference,
      recorded_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { status: "error", message: "We couldn't log that payment. Please try again." };

  const ledger = await getStatement(tenancyId);
  return { status: "success", message: describePayment(ledger, data.id), tenancyId };
}
