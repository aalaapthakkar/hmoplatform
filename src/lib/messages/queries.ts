import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type TenancyLabelRow = Pick<Tables["tenancies"]["Row"], "id" | "status"> & {
  rooms: {
    id: string;
    name: string;
    properties: { id: string; address_line_1: string } | null;
  } | null;
  tenancy_tenants: {
    status: string;
    tenants: { first_name: string; last_name: string; user_id: string | null } | null;
  }[];
};

const TENANCY_LABEL_COLUMNS = `id, status,
  rooms (id, name, properties (id, address_line_1)),
  tenancy_tenants (status, tenants (first_name, last_name, user_id))`;

/** Who and where each tenancy is, for labelling conversations. RLS keeps it to the org. */
export async function getTenancyLabels(tenancyIds: string[]) {
  if (tenancyIds.length === 0) return new Map<string, TenancyLabel>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenancies")
    .select(TENANCY_LABEL_COLUMNS)
    .in("id", tenancyIds)
    .overrideTypes<TenancyLabelRow[], { merge: false }>();
  if (error) throw new Error("Could not load tenancies", { cause: error.code });
  return new Map(data.map((row) => [row.id, tenancyLabel(row)]));
}

export type TenancyLabel = {
  id: string;
  /** "Priya Shah", or "Priya Shah and Tom Walsh". */
  names: string;
  /** "Room 1, 12 High Street". */
  place: string;
  roomHref: string | null;
  /** Tenant names by their portal account, for labelling their messages. */
  byUser: Map<string, string>;
};

export function tenancyLabel(row: TenancyLabelRow): TenancyLabel {
  const tenants = row.tenancy_tenants
    .filter((link) => link.status === "active" && link.tenants)
    .map((link) => link.tenants!);
  const room = row.rooms;
  const property = room?.properties;
  return {
    id: row.id,
    names:
      tenants.map((tenant) => `${tenant.first_name} ${tenant.last_name}`).join(" and ") ||
      "No tenant recorded",
    place: [room?.name, property?.address_line_1].filter(Boolean).join(", "),
    roomHref:
      room && property ? `/properties/${property.id}/rooms/${room.id}?tenancy=${row.id}` : null,
    byUser: new Map(
      tenants
        .filter((tenant) => tenant.user_id)
        .map((tenant) => [tenant.user_id!, `${tenant.first_name} ${tenant.last_name}`]),
    ),
  };
}
