"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validation/maintenance";

/** Replies to a tenancy's tenants. They see it in their portal. */
export async function sendStaffMessage(tenancyId: string, input: unknown): Promise<ActionResult> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the message." };
  }
  if (!z.uuid().safeParse(tenancyId).success) {
    return { status: "error", message: "We couldn't find that tenancy." };
  }
  const membership = await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    org_id: membership.orgId,
    tenancy_id: tenancyId,
    sender: "staff",
    body: parsed.data.body,
  });
  if (error) return { status: "error", message: "We couldn't send that. Please try again." };
  return { status: "success", message: "Message sent." };
}
