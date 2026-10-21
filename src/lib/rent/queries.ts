import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildStatement } from "./statement";

const CHARGE_COLUMNS = "id, due_date, amount_pence, description, status, void_reason, kind";
const PAYMENT_COLUMNS = "id, paid_on, amount_pence, method, reference, status, void_reason";

/**
 * Brings the rent schedule up to date, then builds the statement. RLS decides
 * what the signed-in user (staff member or tenant) can see.
 */
export async function getStatement(tenancyId: string) {
  const supabase = await createClient();
  // Adds any rent charges that have fallen due since the last visit. A
  // failure here only means the newest charge shows up next time.
  await supabase.rpc("sync_rent_charges", { p_tenancy_id: tenancyId });
  const [charges, payments] = await Promise.all([
    supabase.from("rent_charges").select(CHARGE_COLUMNS).eq("tenancy_id", tenancyId),
    supabase.from("rent_payments").select(PAYMENT_COLUMNS).eq("tenancy_id", tenancyId),
  ]);
  if (charges.error) throw charges.error;
  if (payments.error) throw payments.error;
  return buildStatement(charges.data, payments.data);
}
