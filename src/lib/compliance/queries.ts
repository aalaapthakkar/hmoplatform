import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import type { ServiceField } from "./fields";
import { recipientsFrom, type ServeTenancyRow } from "./serving";
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

/** Tenants a property's certificates can be served to. RLS keeps it to the organisation. */
export async function getServeRecipients(propertyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenancies")
    .select(
      "id, status, rooms!inner (name, property_id), tenancy_tenants (status, tenants (id, first_name, last_name, email))",
    )
    .eq("rooms.property_id", propertyId)
    .in("status", ["prospective", "active", "ending"])
    .overrideTypes<ServeTenancyRow[], { merge: false }>();
  if (error) throw new Error("Could not load tenants", { cause: error.code });
  return recipientsFrom(data);
}

export type ServiceRecord = {
  id: string;
  documentId: string;
  propertyServiceId: string | null;
  subject: string;
  sentAt: string;
  sentBy: string | null;
  recipients: {
    name: string;
    email: string | null;
    channel: "portal" | "email_and_portal";
    emailStatus: "sent" | "failed" | "no_email";
    error: string | null;
  }[];
};

type ServiceRecordRow = {
  id: string;
  document_id: string;
  property_service_id: string | null;
  subject: string;
  sent_at: string;
  users: { full_name: string | null; email: string | null } | null;
  certificate_service_recipients: {
    name: string;
    email: string | null;
    channel: "portal" | "email_and_portal";
    email_status: "sent" | "failed" | "no_email";
    error: string | null;
  }[];
};

/** Every time a certificate was served at a property, newest first, with who it went to. */
export async function getServiceRecords(propertyId: string): Promise<ServiceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certificate_services")
    .select(
      "id, document_id, property_service_id, subject, sent_at, users:sent_by (full_name, email), certificate_service_recipients (name, email, channel, email_status, error)",
    )
    .eq("property_id", propertyId)
    .order("sent_at", { ascending: false })
    .overrideTypes<ServiceRecordRow[], { merge: false }>();
  if (error) throw new Error("Could not load served certificates", { cause: error.code });
  return data.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    propertyServiceId: row.property_service_id,
    subject: row.subject,
    sentAt: row.sent_at,
    sentBy: row.users?.full_name ?? row.users?.email ?? null,
    recipients: row.certificate_service_recipients
      .map((recipient) => ({
        name: recipient.name,
        email: recipient.email,
        channel: recipient.channel,
        emailStatus: recipient.email_status,
        error: recipient.error,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
