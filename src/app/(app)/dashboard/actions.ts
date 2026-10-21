"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ id: z.uuid(), status: z.enum(["done", "dismissed"]) });

/** Marks a reminder done or dismissed. It stays on record either way. */
export async function closeReminder(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "We couldn't find that reminder." };

  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({
      status: parsed.data.status,
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", parsed.data.id)
    .eq("org_id", membership.orgId)
    .eq("status", "open")
    .select("id");
  if (error || data.length === 0) {
    return { status: "error", message: "We couldn't update that reminder. Refresh and try again." };
  }
  return {
    status: "success",
    message: parsed.data.status === "done" ? "Reminder done." : "Reminder dismissed.",
  };
}
