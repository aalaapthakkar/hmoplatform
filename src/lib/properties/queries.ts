import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import type { PropertyListRow } from "@/lib/properties/summary";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

export type PropertyDetail = PropertyListRow &
  Pick<
    PropertyRow,
    | "council"
    | "property_type"
    | "bedrooms"
    | "ownership_type"
    | "head_rent_pence"
    | "description"
    | "amenities"
    | "house_rules"
    | "bills_included"
    | "welcome_pack"
  >;

const PROPERTY_DETAIL_COLUMNS = `
  id, address_line_1, address_line_2, town, postcode, tags, status, letting_type,
  council, property_type, bedrooms, ownership_type, head_rent_pence,
  description, amenities, house_rules, bills_included, welcome_pack,
  rooms (status, documents (expiry_date, status)),
  documents (expiry_date, status)
`;

/**
 * One property in the signed-in user's organisation, or a 404. Cached per
 * request, so the layout and the section pages share one query.
 */
export const getProperty = cache(async (propertyId: string): Promise<PropertyDetail> => {
  if (!z.uuid().safeParse(propertyId).success) notFound();

  const membership = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_DETAIL_COLUMNS)
    .eq("id", propertyId)
    .eq("org_id", membership.orgId)
    .maybeSingle()
    .overrideTypes<PropertyDetail, { merge: false }>();

  if (error) throw new Error("Could not load the property", { cause: error.code });
  if (!data) notFound();
  return data;
});

/** The organisation's active owners, for choosing one. */
export async function getOwners() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owners")
    .select("id, name")
    .eq("org_id", membership.orgId)
    .eq("status", "active")
    .order("name");
  if (error) throw new Error("Could not load owners", { cause: error.code });
  return data;
}
