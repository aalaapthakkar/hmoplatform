import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { MembershipRole } from "@/db/schema";
import { LOG_IN_ROUTE, PORTAL_ROUTE } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

export type CurrentMembership = {
  orgId: string;
  orgName: string;
  role: MembershipRole;
};

/** The signed-in user, verified from the session JWT. Redirects to log in if there isn't one. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect(LOG_IN_ROUTE);

  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/**
 * The user's active organisation, or null if they haven't joined one.
 * Reads through RLS, so it only ever sees the user's own memberships.
 */
export const getCurrentMembership = cache(async (): Promise<CurrentMembership | null> => {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role, organisations(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Could not load organisation membership", { cause: error.code });
  if (!data?.organisations) return null;

  return { orgId: data.org_id, orgName: data.organisations.name, role: data.role };
});

/**
 * Whether the signed-in user has joined the tenant portal. RLS only lets a
 * tenant see tenant records linked to their own account.
 */
export const isTenantUser = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (error) throw new Error("Could not check tenant access", { cause: error.code });
  return data.length > 0;
});

/**
 * Like getCurrentMembership, but sends tenants to their portal and anyone
 * else without an organisation to onboarding.
 */
export async function requireMembership(): Promise<CurrentMembership> {
  const membership = await getCurrentMembership();
  if (membership) return membership;
  if (await isTenantUser()) redirect(PORTAL_ROUTE);
  redirect("/onboarding");
}
