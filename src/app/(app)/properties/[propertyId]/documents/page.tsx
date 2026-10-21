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
      "id, document_type, file_name, expiry_date, status, created_at, users (full_name, email)",
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .overrideTypes<DocumentListRow[], { merge: false }>();
  if (error) throw new Error("Could not load documents", { cause: error.code });

  const today = todayInLondon();
  const documents = data.map((row) => summariseDocument(row, today));

  return (
    <DocumentsSection
      orgId={membership.orgId}
      propertyId={propertyId}
      documents={documents.filter((document) => document.active)}
      archived={documents.filter((document) => !document.active)}
    />
  );
}
