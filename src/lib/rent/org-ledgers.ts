import "server-only";
import { todayInLondon } from "@/lib/format";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";
import {
  buildLedger,
  CHARGE_COLUMNS,
  type Ledger,
  type LedgerCharge,
  type LedgerPayment,
  PAYMENT_COLUMNS,
} from "./ledger";

type TenancyRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  rooms: {
    id: string;
    name: string;
    properties: { id: string; address_line_1: string; postcode: string } | null;
  } | null;
  tenancy_tenants: {
    status: string;
    tenants: { first_name: string; last_name: string } | null;
  }[];
};

export type TenancyLedger = {
  tenancyId: string;
  status: string;
  tenantNames: string;
  roomName: string;
  propertyId: string | null;
  /** "12 High Street, LS6 2AB". */
  propertyLabel: string;
  ledger: Ledger;
};

/**
 * Every tenancy in the organisation that has rent to account for (paying
 * now, or with anything on its ledger), each with its ledger worked out.
 * RLS keeps it to the signed-in member's organisation.
 */
export async function getOrgLedgers(
  orgId: string,
  { propertyId }: { propertyId?: string } = {},
): Promise<TenancyLedger[]> {
  const supabase = await createClient();
  const [tenancies, charges, payments] = await Promise.all([
    readAll<TenancyRow>((from, to) => {
      let query = supabase
        .from("tenancies")
        .select(
          `id, status, start_date, end_date,
           rooms!inner (id, name, property_id, properties (id, address_line_1, postcode)),
           tenancy_tenants (status, tenants (first_name, last_name))`,
        )
        .eq("org_id", orgId)
        .in("status", ["active", "ending", "ended"]);
      if (propertyId) query = query.eq("rooms.property_id", propertyId);
      return query.order("id").range(from, to).overrideTypes<TenancyRow[], { merge: false }>();
    }),
    readAll<LedgerCharge & { tenancy_id: string }>((from, to) =>
      supabase
        .from("rent_charges")
        .select(`tenancy_id, ${CHARGE_COLUMNS}`)
        .eq("org_id", orgId)
        .order("id")
        .range(from, to),
    ),
    readAll<LedgerPayment & { tenancy_id: string }>((from, to) =>
      supabase
        .from("rent_payments")
        .select(`tenancy_id, ${PAYMENT_COLUMNS}`)
        .eq("org_id", orgId)
        .order("id")
        .range(from, to),
    ),
  ]);

  const chargesBy = Map.groupBy(charges, (charge) => charge.tenancy_id);
  const paymentsBy = Map.groupBy(payments, (payment) => payment.tenancy_id);
  const today = todayInLondon();

  return tenancies
    .filter(
      (tenancy) =>
        tenancy.status !== "ended" || chargesBy.has(tenancy.id) || paymentsBy.has(tenancy.id),
    )
    .map((tenancy) => {
      const property = tenancy.rooms?.properties ?? null;
      return {
        tenancyId: tenancy.id,
        status: tenancy.status,
        tenantNames:
          tenancy.tenancy_tenants
            .filter((link) => link.status === "active" && link.tenants)
            .map((link) => `${link.tenants!.first_name} ${link.tenants!.last_name}`)
            .join(" and ") || "No tenant recorded",
        roomName: tenancy.rooms?.name ?? "",
        propertyId: property?.id ?? null,
        propertyLabel: property ? `${property.address_line_1}, ${property.postcode}` : "",
        ledger: buildLedger(
          chargesBy.get(tenancy.id) ?? [],
          paymentsBy.get(tenancy.id) ?? [],
          today,
        ),
      };
    });
}
