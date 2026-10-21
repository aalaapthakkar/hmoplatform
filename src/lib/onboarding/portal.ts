import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { looksLikePortalToken } from "./portal-token";

const overviewSchema = z.object({
  organisation: z.string(),
  address: z.string().nullable(),
  room: z.string().nullable(),
  moveInDate: z.string().nullable(),
  firstName: z.string().nullable(),
  expiresAt: z.string(),
  application: z.record(z.string(), z.unknown()),
  submittedAt: z.string().nullable(),
  uploadFolder: z.string(),
  steps: z.array(
    z.object({
      title: z.string(),
      status: z.enum(["not_started", "in_progress", "done", "skipped"]),
      yours: z.boolean(),
    }),
  ),
  documents: z.array(z.object({ fileName: z.string(), type: z.string(), uploadedAt: z.string() })),
});

export type PortalOverview = z.infer<typeof overviewSchema>;

/**
 * What an applicant's link opens, or null if the link is wrong, expired or
 * switched off. The database function decides; it only ever returns the one
 * onboarding the token belongs to.
 */
export async function getPortalOverview(token: string): Promise<PortalOverview | null> {
  if (!looksLikePortalToken(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_overview", { p_token: token });
  if (error) {
    if (error.code === "P0001") return null;
    throw new Error("Could not load the application", { cause: error.code });
  }
  const parsed = overviewSchema.safeParse(data);
  if (!parsed.success) throw new Error("Unexpected application data");
  return parsed.data;
}
