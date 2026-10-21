"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { MAINTENANCE_STATUS_LABELS } from "@/lib/validation/maintenance";

const statusSchema = z.object({
  requestId: z.uuid(),
  status: z.enum(["reported", "in_progress", "done", "closed"]),
});

/** Moves a repair along. Fixed and closed repairs get a resolved date; reopening clears it. */
export async function updateRepairStatus(input: unknown): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Choose a status." };
  const { requestId, status } = parsed.data;

  const membership = await requireMembership();
  const supabase = await createClient();
  const finished = status === "done" || status === "closed";
  const { data: current } = await supabase
    .from("maintenance_requests")
    .select("resolved_at")
    .eq("id", requestId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!current) {
    return { status: "error", message: "We couldn't find that repair. Refresh and try again." };
  }

  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      status,
      resolved_at: finished ? (current.resolved_at ?? new Date().toISOString()) : null,
    })
    .eq("id", requestId)
    .eq("org_id", membership.orgId);
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };
  return {
    status: "success",
    message: `Marked as ${MAINTENANCE_STATUS_LABELS[status].toLowerCase()}.`,
  };
}
