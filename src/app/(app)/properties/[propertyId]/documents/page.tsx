import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentsSection } from "@/components/properties/documents-section";
import { SectionFallback } from "@/components/properties/section-heading";
import { requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import { type DocumentListRow, summariseDocument } from "@/lib/properties/documents";
import { getProperty } from "@/lib/properties/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documents" };

type ServableTenancyRow = {
  id: string;
  status: string;
  rooms: { name: string };
  tenancy_tenants: {
    status: string;
    tenants: { first_name: string; last_name: string } | null;
  }[];
};

export default function DocumentsPage({ params }: PageProps<"/properties/[propertyId]/documents">) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Documents params={params} />
    </Suspense>
  );
}

async function Documents({
  params,
}: Pick<PageProps<"/properties/[propertyId]/documents">, "params">) {
  const { propertyId } = await params;
  const [membership] = await Promise.all([requireMembership(), getProperty(propertyId)]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, document_type, file_name, expiry_date, status, created_at, users (full_name, email), document_services (tenancy_id, served_at)",
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .overrideTypes<DocumentListRow[], { merge: false }>();
  if (error) throw new Error("Could not load documents", { cause: error.code });

  const today = todayInLondon();
  const documents = data.map((row) => summariseDocument(row, today));

  // Tenancies in this property that documents can be given to.
  const { data: tenancyRows, error: tenancyError } = await supabase
    .from("tenancies")
    .select(
      "id, status, rooms!inner (name, property_id), tenancy_tenants (status, tenants (first_name, last_name))",
    )
    .eq("rooms.property_id", propertyId)
    .in("status", ["prospective", "active", "ending", "ended"])
    .overrideTypes<ServableTenancyRow[], { merge: false }>();
  if (tenancyError) throw new Error("Could not load tenancies", { cause: tenancyError.code });
  const tenancies = tenancyRows.map((row) => {
    const names = row.tenancy_tenants
      .filter((link) => link.status === "active" && link.tenants)
      .map((link) => `${link.tenants!.first_name} ${link.tenants!.last_name}`)
      .join(" and ");
    return {
      id: row.id,
      open: row.status !== "ended",
      label: `${names || "No tenant recorded"} (${row.rooms.name})`,
    };
  });

  return (
    <DocumentsSection
      orgId={membership.orgId}
      propertyId={propertyId}
      documents={documents.filter((document) => document.active)}
      archived={documents.filter((document) => !document.active)}
      tenancies={tenancies}
    />
  );
}
