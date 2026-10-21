"use server";

import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { newPropertySchema, toCreatePropertyArgs } from "@/lib/validation/property";

export type CreatePropertyResult = { status: "success" | "error"; message: string };

/**
 * Saves the Add property wizard. The input is checked again here, whatever the
 * browser did. create_property runs as the signed-in user, so RLS limits it to
 * their organisation and the audit log records every row it adds.
 */
export async function createProperty(input: unknown): Promise<CreatePropertyResult> {
  const parsed = newPropertySchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message:
        "Some details need another look. Go back through the steps and check the highlighted fields.",
    };
  }

  const membership = await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "create_property",
    toCreatePropertyArgs(membership.orgId, parsed.data),
  );

  if (error) {
    return { status: "error", message: "We couldn't save this property. Please try again." };
  }

  const { addressLine1, lettingType, roomCount } = parsed.data;
  const rooms =
    lettingType === "single_let"
      ? "as a single let"
      : `with ${roomCount} ${roomCount === 1 ? "room" : "rooms"}`;
  return { status: "success", message: `${addressLine1} added ${rooms}.` };
}
