import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import type { ServiceField } from "./fields";
import type { ComplianceItem } from "./status";

/** Every compliance item in the organisation (each active property × each active type). */
export async function getOrgComplianceItems(orgId: string): Promise<ComplianceItem[]> {
  const supabase = await createClient();
  return readAll<ComplianceItem>((from, to) =>
    supabase
      .from("compliance_items")
      .select("*")
      .eq("org_id", orgId)
      .order("property_id")
      .order("service_type_id")
      .range(from, to),
  );
}

/** How many overdue items each property has, for the overdue badges. */
export async function overdueCounts(orgId: string, propertyId?: string) {
  const supabase = await createClient();
  const rows = await readAll<{ property_id: string }>((from, to) => {
    let query = supabase
      .from("compliance_items")
      .select("property_id")
      .eq("org_id", orgId)
      .eq("status", "overdue");
    if (propertyId) query = query.eq("property_id", propertyId);
    return query.order("property_id").order("service_type_id").range(from, to);
  });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.property_id, (counts.get(row.property_id) ?? 0) + 1);
  return counts;
}

/** Everything the compliance dashboard and its CSV need for the organisation. */
export async function getComplianceOverview(orgId: string) {
  const supabase = await createClient();
  const [items, properties, types] = await Promise.all([
    getOrgComplianceItems(orgId),
    readAll<{ id: string; address_line_1: string; postcode: string }>((from, to) =>
      supabase
        .from("properties")
        .select("id, address_line_1, postcode")
        .eq("org_id", orgId)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    ),
    supabase.from("service_types").select("id, fields").eq("org_id", orgId),
  ]);
  if (types.error) throw new Error("Could not load compliance types", { cause: types.error.code });
  return {
    items,
    propertyLabels: new Map(
      properties.map((property) => [
        property.id,
        `${property.address_line_1}, ${property.postcode}`,
      ]),
    ),
    fieldsByType: new Map(types.data.map((type) => [type.id, type.fields as ServiceField[]])),
  };
}
