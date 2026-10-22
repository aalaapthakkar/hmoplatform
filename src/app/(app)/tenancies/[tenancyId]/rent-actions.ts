"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env";
import { formatPence, todayInLondon } from "@/lib/format";
import { createPortalToken } from "@/lib/onboarding/portal-token";
import { createClient } from "@/lib/supabase/server";
import { dateField } from "@/lib/validation/dates";
import { poundsField } from "@/lib/validation/property";

const id = z.uuid();
const CHECK: ActionResult = { status: "error", message: "Check the details and try again." };

export type PaymentFormValues = {
  paidOn: string;
  amount: string;
  method: string;
  reference: string;
};

const paymentSchema = z.object({
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
});

/** Records money received from the tenant. */
export async function recordPayment(tenancyId: string, input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? CHECK.message };
  if (!id.safeParse(tenancyId).success) return CHECK;

  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();
  const { error } = await supabase.from("rent_payments").insert({
    org_id: membership.orgId,
    tenancy_id: tenancyId,
    paid_on: parsed.data.paidOn,
    amount_pence: parsed.data.amount,
    method: parsed.data.method,
    reference: parsed.data.reference,
    recorded_by: user.id,
  });
  if (error)
    return { status: "error", message: "We couldn't record that payment. Please try again." };
  return { status: "success", message: `Payment of ${formatPence(parsed.data.amount)} recorded.` };
}

export type ChargeFormValues = { dueDate: string; amount: string; description: string };

const chargeSchema = z.object({
  dueDate: dateField("due date"),
  amount: poundsField("amount"),
  description: z
    .string()
    .trim()
    .min(1, "Say what the charge is for")
    .max(120, "Use 120 characters or fewer"),
});

/** Adds a one-off charge, such as a replacement key. */
export async function addCharge(tenancyId: string, input: unknown): Promise<ActionResult> {
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? CHECK.message };
  if (!id.safeParse(tenancyId).success) return CHECK;

  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();
  const { error } = await supabase.from("rent_charges").insert({
    created_by: user.id,
    org_id: membership.orgId,
    tenancy_id: tenancyId,
    kind: "other",
    source: "manual",
    due_date: parsed.data.dueDate,
    amount_pence: parsed.data.amount,
    description: parsed.data.description,
  });
  if (error) return { status: "error", message: "We couldn't add that charge. Please try again." };
  return { status: "success", message: "Charge added." };
}

const reverseSchema = z.object({
  kind: z.enum(["charge", "payment"]),
  entryId: z.uuid(),
  reason: z.string().trim().min(1, "Give a reason").max(300, "Use 300 characters or fewer"),
});

/**
 * Reverses a charge or a payment. Ledger rows are never edited: a reversal
 * row cancels the entry, which stays on the statement, marked as reversed.
 */
export async function reverseEntry(input: unknown): Promise<ActionResult> {
  const parsed = reverseSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? CHECK.message };
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_ledger_entry", {
    p_kind: parsed.data.kind,
    p_entry_id: parsed.data.entryId,
    p_reason: parsed.data.reason,
  });
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error) {
    return { status: "error", message: "We couldn't reverse that entry. Refresh and try again." };
  }
  return {
    status: "success",
    message: parsed.data.kind === "charge" ? "Charge reversed." : "Payment reversed.",
  };
}

export type InviteResult = ActionResult & { link?: string; expiresAt?: string };

/**
 * Makes a tenant portal invite for the tenancy's tenant. Only its hash is
 * stored, so this is the one time the link is available.
 */
export async function inviteToPortal(tenantId: string): Promise<InviteResult> {
  if (!id.safeParse(tenantId).success) return CHECK;
  await requireMembership();
  const supabase = await createClient();
  const { token, hash } = createPortalToken();
  const { data, error } = await supabase.rpc("create_tenant_invite", {
    p_tenant_id: tenantId,
    p_token_hash: hash,
  });
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error) return { status: "error", message: "We couldn't make an invite. Please try again." };
  return {
    status: "success",
    message: "Invite ready. Copy it or email it now: for security, it isn't shown again.",
    link: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/portal/join/${token}`,
    expiresAt: data,
  };
}
