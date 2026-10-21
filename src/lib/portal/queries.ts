import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentMembership, getCurrentUser, isTenantUser } from "@/lib/auth/session";
import { HOME_ROUTE } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { parseTenantHomes, primaryHome, type TenantHome } from "./home";

/**
 * The signed-in tenant and the tenancy the portal shows (null if they have
 * none to show yet). Staff are sent to the staff app, and anyone else to
 * set up an organisation.
 */
export const requireTenant = cache(
  async (): Promise<{ userId: string; home: TenantHome | null }> => {
    const user = await getCurrentUser();
    if (!(await isTenantUser())) {
      redirect((await getCurrentMembership()) ? HOME_ROUTE : "/onboarding");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("tenant_home");
    if (error) throw new Error("Could not load the tenant's home", { cause: error.code });
    return { userId: user.id, home: primaryHome(parseTenantHomes(data)) };
  },
);
