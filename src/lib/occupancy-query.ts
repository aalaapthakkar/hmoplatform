import "server-only";

import { requireMembership } from "@/lib/auth/session";
import { buildOccupancy, type OccupancyRoomRow } from "@/lib/occupancy";
import { createClient } from "@/lib/supabase/server";

const OCCUPANCY_COLUMNS = `
  id, name, status, rent_pence, rent_frequency,
  properties (id, address_line_1, postcode, status),
  tenancies (id, status, start_date, end_date, rent_pence, rent_frequency,
    tenancy_tenants (status, tenants (first_name, last_name)))
`;

/** Every room in the signed-in user's organisation, through RLS, as occupancy rows. */
export async function getOccupancy() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select(OCCUPANCY_COLUMNS)
    .eq("org_id", membership.orgId)
    .neq("status", "archived")
    .overrideTypes<OccupancyRoomRow[], { merge: false }>();
  if (error) throw new Error("Could not load occupancy", { cause: error.code });
  return buildOccupancy(data);
}
