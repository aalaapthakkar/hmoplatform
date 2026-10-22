"use server";

import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Turns your own daily compliance reminder email on or off. */
export async function setComplianceEmails(on: boolean): Promise<ActionResult> {
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_compliance_emails", { p_on: on === true });
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };
  return {
    status: "success",
    message: on ? "You'll get compliance reminders." : "Compliance reminders are off.",
  };
}
