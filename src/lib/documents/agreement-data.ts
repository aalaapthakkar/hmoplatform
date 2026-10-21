import "server-only";

import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { type MergeValues, type TemplateKind, tenancyMergeValues } from "./merge";

type TenancyRow = {
  id: string;
  status: string;
  start_date: string;
  rent_pence: number;
  rent_frequency: string;
  rent_due_day: number;
  deposit_pence: number;
  rooms: {
    id: string;
    name: string;
    properties: {
      id: string;
      address_line_1: string;
      address_line_2: string | null;
      town: string;
      postcode: string;
      property_owners: { status: string; owners: { name: string } | null }[];
    } | null;
  } | null;
  tenancy_tenants: {
    status: string;
    tenants: { id: string; first_name: string; last_name: string; email: string | null } | null;
  }[];
  tenancy_guarantors: {
    id: string;
    name: string;
    email: string;
    address: string | null;
    status: string;
  }[];
};

const COLUMNS = `
  id, status, start_date, rent_pence, rent_frequency, rent_due_day, deposit_pence,
  rooms (id, name, properties (id, address_line_1, address_line_2, town, postcode,
    property_owners (status, owners (name)))),
  tenancy_tenants (status, tenants (id, first_name, last_name, email)),
  tenancy_guarantors (id, name, email, address, status)
`;

export type AgreementData = {
  tenancyId: string;
  tenancyStatus: string;
  orgId: string;
  propertyId: string;
  roomId: string;
  tenant: { id: string; name: string; email: string | null };
  guarantor: { id: string; name: string; email: string; address: string | null } | null;
  template: { id: string; name: string; body: string; isDraft: boolean } | null;
  values: MergeValues;
  title: string;
};

/**
 * Everything needed to produce an agreement for a tenancy in the user's
 * organisation: the default template for the kind, and the merge values.
 * Null if the tenancy isn't found.
 */
export async function getAgreementData(
  tenancyId: string,
  kind: TemplateKind,
): Promise<AgreementData | null> {
  if (!z.uuid().safeParse(tenancyId).success) return null;
  const membership = await requireMembership();
  const supabase = await createClient();

  const [tenancyResult, templateResult] = await Promise.all([
    supabase
      .from("tenancies")
      .select(COLUMNS)
      .eq("id", tenancyId)
      .eq("org_id", membership.orgId)
      .maybeSingle()
      .overrideTypes<TenancyRow, { merge: false }>(),
    supabase
      .from("document_templates")
      .select("id, name, body, is_draft")
      .eq("org_id", membership.orgId)
      .eq("kind", kind)
      .eq("is_default", true)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (tenancyResult.error || templateResult.error) {
    throw new Error("Could not load the agreement", {
      cause: tenancyResult.error?.code ?? templateResult.error?.code,
    });
  }
  const tenancy = tenancyResult.data;
  const room = tenancy?.rooms;
  const property = room?.properties;
  const tenant = tenancy?.tenancy_tenants.find((link) => link.status === "active")?.tenants;
  if (!tenancy || !room || !property || !tenant) return null;

  const guarantor = tenancy.tenancy_guarantors.find((g) => g.status === "required") ?? null;
  const landlord =
    property.property_owners.find((link) => link.status === "active")?.owners?.name ?? null;
  const tenantName = `${tenant.first_name} ${tenant.last_name}`;
  const address = [
    property.address_line_1,
    property.address_line_2,
    `${property.town} ${property.postcode}`,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    tenancyId: tenancy.id,
    tenancyStatus: tenancy.status,
    orgId: membership.orgId,
    propertyId: property.id,
    roomId: room.id,
    tenant: { id: tenant.id, name: tenantName, email: tenant.email },
    guarantor: guarantor
      ? {
          id: guarantor.id,
          name: guarantor.name,
          email: guarantor.email,
          address: guarantor.address,
        }
      : null,
    template: templateResult.data
      ? {
          id: templateResult.data.id,
          name: templateResult.data.name,
          body: templateResult.data.body,
          isDraft: templateResult.data.is_draft,
        }
      : null,
    values: tenancyMergeValues({
      tenantName,
      tenantEmail: tenant.email,
      room: room.name,
      propertyAddress: address,
      rentPence: tenancy.rent_pence,
      rentFrequency: tenancy.rent_frequency,
      rentDueDay: tenancy.rent_due_day,
      depositPence: tenancy.deposit_pence,
      startDate: tenancy.start_date,
      organisationName: membership.orgName,
      landlordName: landlord,
      guarantorName: guarantor?.name ?? null,
      guarantorAddress: guarantor?.address ?? null,
      today: todayInLondon(),
    }),
    title: `${kind === "guarantor_agreement" ? "Guarantor agreement" : "Tenancy agreement"}: ${tenantName}, ${room.name}`,
  };
}
