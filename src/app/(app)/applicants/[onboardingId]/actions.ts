"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env";
import { createPortalToken } from "@/lib/onboarding/portal-token";
import { createClient } from "@/lib/supabase/server";
import { optionalDateField } from "@/lib/validation/dates";
import { rightToRentSchema } from "@/lib/validation/right-to-rent";

const id = z.uuid();
const CHECK_AGAIN: ActionResult = {
  status: "error",
  message: "Some details need another look. Check the highlighted fields and try again.",
};
const NOT_FOUND: ActionResult = {
  status: "error",
  message: "We couldn't find that. Refresh the page and try again.",
};

/** P0001 errors from the onboarding functions are written for people. */
function failure(error: PostgrestError): ActionResult {
  if (error.code === "P0001") return { status: "error", message: error.message };
  if (error.code === "P0002") return NOT_FOUND;
  return { status: "error", message: "We couldn't save that. Please try again." };
}

export type StepFormValues = { status: string; owner: string; dueDate: string; notes: string };

const stepSchema = z.object({
  status: z.enum(["not_started", "in_progress", "done", "skipped"], "Choose a status"),
  /** "applicant", a staff member's id, or "" for nobody. */
  owner: z.union([z.literal("applicant"), z.literal(""), z.uuid()], "Choose who owns this step"),
  dueDate: optionalDateField,
  notes: z.string().trim().max(2000, "Use 2,000 characters or fewer"),
});

/** Saves a step's status, owner, due date and notes. */
export async function updateStep(stepId: string, input: unknown): Promise<ActionResult> {
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(stepId).success) return CHECK_AGAIN;

  await requireMembership();
  const supabase = await createClient();
  const { owner, status, dueDate, notes } = parsed.data;
  const { error } = await supabase.rpc("update_onboarding_step", {
    p_step_id: stepId,
    p_status: status,
    p_owner_user_id: owner && owner !== "applicant" ? owner : null,
    p_owner_is_applicant: owner === "applicant",
    p_due_date: dueDate,
    p_notes: notes || null,
  });
  if (error) return failure(error);

  return { status: "success", message: status === "done" ? "Step done." : "Step saved." };
}

export type LinkResult = ActionResult & { link?: string; expiresAt?: string };

/**
 * Makes a new applicant link. Only its hash is stored, so this is the one
 * time the link itself is available; any older link stops working.
 */
export async function createPortalLink(onboardingId: string): Promise<LinkResult> {
  if (!id.safeParse(onboardingId).success) return NOT_FOUND;

  await requireMembership();
  const supabase = await createClient();
  const { token, hash } = createPortalToken();
  const { data, error } = await supabase.rpc("set_portal_link", {
    p_onboarding_id: onboardingId,
    p_token_hash: hash,
  });
  if (error) return failure(error);

  return {
    status: "success",
    message: "New link ready. Copy it or email it now: for security, it isn't shown again.",
    link: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/apply/${token}`,
    expiresAt: data,
  };
}

export async function revokePortalLink(onboardingId: string): Promise<ActionResult> {
  if (!id.safeParse(onboardingId).success) return NOT_FOUND;
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_portal_link", { p_onboarding_id: onboardingId });
  if (error) return failure(error);
  return { status: "success", message: "Link switched off." };
}

export async function recordRightToRent(
  onboardingId: string,
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = rightToRentSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(onboardingId).success || !id.safeParse(tenantId).success) {
    return CHECK_AGAIN;
  }

  await requireMembership();
  const supabase = await createClient();
  const check = parsed.data;
  const { error } = await supabase.rpc("record_right_to_rent", {
    p_tenant_id: tenantId,
    p_onboarding_id: onboardingId,
    p_check_date: check.checkDate,
    p_method: check.method,
    p_permission: check.permission,
    p_expiry_date: check.expiryDate,
    p_notes: check.notes,
  });
  if (error) return failure(error);

  return {
    status: "success",
    message:
      check.permission === "time_limited"
        ? "Right to rent check recorded, with a reminder for the follow-up check."
        : "Right to rent check recorded.",
  };
}

export async function withdrawOnboarding(onboardingId: string): Promise<ActionResult> {
  if (!id.safeParse(onboardingId).success) return NOT_FOUND;
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_onboarding", { p_onboarding_id: onboardingId });
  if (error) return failure(error);
  return {
    status: "success",
    message:
      "Onboarding withdrawn. Cancel the upcoming tenancy from the room if it won't go ahead.",
  };
}
