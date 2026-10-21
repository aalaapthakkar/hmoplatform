"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { dateField } from "@/lib/validation/dates";
import { noticeSchema, tenancySchema } from "@/lib/validation/tenancy";

const CHECK_AGAIN: ActionResult = {
  status: "error",
  message: "Some details need another look. Check the highlighted fields and try again.",
};
const NOT_FOUND: ActionResult = {
  status: "error",
  message: "We couldn't find that tenancy. Refresh the page and try again.",
};

const id = z.uuid();

/**
 * Turns a database error into a message. The tenancy functions raise P0001
 * with sentences written for people, so those are shown as they are.
 */
function failure(error: PostgrestError): ActionResult {
  if (error.code === "P0001") return { status: "error", message: error.message };
  if (error.code === "P0002") return NOT_FOUND;
  if (error.code === "23514" && error.message.includes("deposit")) {
    return { status: "error", message: "The deposit is over the legal limit for this rent." };
  }
  if (error.code === "23505") {
    return {
      status: "error",
      message:
        "Someone else has just changed this room's tenancies. Refresh the page and try again.",
    };
  }
  return { status: "error", message: "We couldn't save that. Please try again." };
}

/** Creates a tenancy with its tenant. Upcoming if it starts in the future, otherwise current. */
export async function createTenancy(roomId: string, input: unknown): Promise<ActionResult> {
  const parsed = tenancySchema.safeParse(input);
  if (!parsed.success || !id.safeParse(roomId).success) return CHECK_AGAIN;

  await requireMembership();
  const supabase = await createClient();
  const tenancy = parsed.data;
  const { data: tenancyId, error } = await supabase.rpc("create_tenancy", {
    p_room_id: roomId,
    p_first_name: tenancy.firstName,
    p_last_name: tenancy.lastName,
    p_email: tenancy.email,
    p_phone: tenancy.phone,
    p_start_date: tenancy.startDate,
    p_rent_pence: tenancy.rent,
    p_rent_frequency: tenancy.rentFrequency,
    p_rent_due_day: tenancy.rentDueDay,
    p_deposit_pence: tenancy.deposit,
  });
  if (error) return failure(error);

  const name = `${tenancy.firstName} ${tenancy.lastName}`;
  const wantsOnboarding =
    typeof input === "object" && input !== null && "startOnboarding" in input
      ? input.startOnboarding === "yes"
      : false;
  if (wantsOnboarding && tenancy.startDate > todayInLondon()) {
    const onboarding = await supabase.rpc("start_onboarding", { p_tenancy_id: tenancyId });
    if (onboarding.error) {
      return {
        status: "success",
        message: `Tenancy for ${name} added, but onboarding couldn't start. Try Start onboarding.`,
        id: tenancyId,
      };
    }
    return {
      status: "success",
      message: `Tenancy for ${name} added and onboarding started.`,
      id: tenancyId,
    };
  }

  return { status: "success", message: `Tenancy for ${name} added.`, id: tenancyId };
}

/** Records (or corrects) notice on a current tenancy. */
export async function recordNotice(tenancyId: string, input: unknown): Promise<ActionResult> {
  const parsed = noticeSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(tenancyId).success) return CHECK_AGAIN;

  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("give_tenancy_notice", {
    p_tenancy_id: tenancyId,
    p_end_reason: parsed.data.endReason,
    p_notice_date: parsed.data.noticeDate,
    p_end_date: parsed.data.endDate,
  });
  if (error) return failure(error);

  return { status: "success", message: "Notice recorded." };
}

const MOVES = {
  end_tenancy: "Tenancy marked as ended. The room is free.",
  start_tenancy: "Moved in. The tenancy is now current.",
  cancel_tenancy: "Upcoming tenancy cancelled.",
} as const;

/** Ends, starts or cancels a tenancy through its database function. */
export async function moveTenancy(
  tenancyId: string,
  move: keyof typeof MOVES,
): Promise<ActionResult> {
  if (!id.safeParse(tenancyId).success || !(move in MOVES)) return NOT_FOUND;

  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc(move, { p_tenancy_id: tenancyId });
  if (error) return failure(error);

  return { status: "success", message: MOVES[move] };
}

/** Starts onboarding for an upcoming tenancy. The result's id is the new onboarding. */
export async function startOnboarding(tenancyId: string): Promise<ActionResult> {
  if (!id.safeParse(tenancyId).success) return NOT_FOUND;

  await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_onboarding", { p_tenancy_id: tenancyId });
  if (error) return failure(error);

  return { status: "success", message: "Onboarding started.", id: data };
}

const moveInSchema = z.object({ startDate: dateField("move-in date") });

/** Changes an upcoming tenancy's move-in date. */
export async function changeMoveInDate(tenancyId: string, input: unknown): Promise<ActionResult> {
  const parsed = moveInSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(tenancyId).success) return CHECK_AGAIN;

  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_move_in_date", {
    p_tenancy_id: tenancyId,
    p_start_date: parsed.data.startDate,
  });
  if (error) return failure(error);

  return { status: "success", message: "Move-in date changed." };
}
