import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import { requireTenant } from "@/lib/portal/queries";
import { rentSummary } from "@/lib/portal/home";
import { createClient } from "@/lib/supabase/server";
import { buildLedger, CHARGE_COLUMNS, PAYMENT_COLUMNS } from "./ledger";
import type { StatementPdfDetails } from "./statement-pdf";

/**
 * Brings the rent schedule up to date, then builds the statement. RLS decides
 * what the signed-in user (staff member or tenant) can see.
 */
export async function getStatement(tenancyId: string) {
  const supabase = await createClient();
  // Adds any rent charges that have fallen due since the daily job last ran.
  // A failure here only means the newest charge shows up after the next run.
  await supabase.rpc("sync_rent_charges", { p_tenancy_id: tenancyId });
  const [charges, payments] = await Promise.all([
    supabase.from("rent_charges").select(CHARGE_COLUMNS).eq("tenancy_id", tenancyId),
    supabase.from("rent_payments").select(PAYMENT_COLUMNS).eq("tenancy_id", tenancyId),
  ]);
  if (charges.error) throw charges.error;
  if (payments.error) throw payments.error;
  return buildLedger(charges.data, payments.data, todayInLondon());
}

type StaffTenancyRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  rent_pence: number;
  rent_frequency: "monthly" | "weekly";
  rent_due_day: number;
  rooms: {
    id: string;
    name: string;
    properties: {
      id: string;
      address_line_1: string;
      address_line_2: string | null;
      town: string;
      postcode: string;
    } | null;
  } | null;
  tenancy_tenants: {
    status: string;
    tenants: { first_name: string; last_name: string } | null;
  }[];
};

/** A tenancy's statement and the details around it, for staff. 404s outside their organisation. */
export async function getStaffStatement(tenancyId: string) {
  if (!z.uuid().safeParse(tenancyId).success) notFound();
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data: tenancy } = await supabase
    .from("tenancies")
    .select(
      `id, status, start_date, end_date, rent_pence, rent_frequency, rent_due_day,
       rooms (id, name, properties (id, address_line_1, address_line_2, town, postcode)),
       tenancy_tenants (status, tenants (first_name, last_name))`,
    )
    .eq("id", tenancyId)
    .eq("org_id", membership.orgId)
    .maybeSingle()
    .overrideTypes<StaffTenancyRow, { merge: false }>();
  if (!tenancy) notFound();

  const ledger = await getStatement(tenancyId);
  const property = tenancy.rooms?.properties;
  const tenantNames =
    tenancy.tenancy_tenants
      .filter((link) => link.status === "active" && link.tenants)
      .map((link) => `${link.tenants!.first_name} ${link.tenants!.last_name}`)
      .join(" and ") || "No tenant recorded";
  const details: StatementPdfDetails = {
    organisation: membership.orgName,
    tenantNames,
    room: tenancy.rooms?.name ?? "",
    address: property
      ? [property.address_line_1, property.address_line_2, `${property.town} ${property.postcode}`]
          .filter(Boolean)
          .join(", ")
      : "",
    rent: rentSummary({
      rentPence: tenancy.rent_pence,
      rentFrequency: tenancy.rent_frequency,
      rentDueDay: tenancy.rent_due_day,
    }),
  };
  return { tenancy, ledger, details };
}

/** The signed-in tenant's statement and its details, or null if they have no tenancy to show. */
export async function getTenantStatement() {
  const { userId, home } = await requireTenant();
  if (!home) return null;
  const supabase = await createClient();
  const [ledger, { data: me }] = await Promise.all([
    getStatement(home.tenancyId),
    supabase.from("tenants").select("first_name, last_name").eq("user_id", userId).limit(1),
  ]);
  const details: StatementPdfDetails = {
    organisation: home.organisation,
    tenantNames: me?.[0] ? `${me[0].first_name} ${me[0].last_name}` : "Tenant",
    room: home.room.name,
    address: home.property.address,
    rent: rentSummary(home),
  };
  return { home, ledger, details };
}
