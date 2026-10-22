import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PropertyCompliance } from "@/components/compliance/property-compliance";
import { SectionFallback, SectionHeading } from "@/components/properties/section-heading";
import { requireMembership } from "@/lib/auth/session";
import type { ServiceField } from "@/lib/compliance/fields";
import { getServeRecipients, getServiceRecords } from "@/lib/compliance/queries";
import { byUrgency, ragCounts } from "@/lib/compliance/status";
import { todayInLondon } from "@/lib/format";
import { getProperty } from "@/lib/properties/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compliance" };

type Props = PageProps<"/properties/[propertyId]/compliance">;

export default function CompliancePage({ params }: Props) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Compliance params={params} />
    </Suspense>
  );
}

async function Compliance({ params }: Pick<Props, "params">) {
  const { propertyId } = await params;
  const [membership, property] = await Promise.all([requireMembership(), getProperty(propertyId)]);
  const supabase = await createClient();
  const [items, types, recipients, records] = await Promise.all([
    supabase.from("compliance_items").select("*").eq("property_id", propertyId),
    supabase.from("service_types").select("id, fields").eq("org_id", membership.orgId),
    getServeRecipients(propertyId),
    getServiceRecords(propertyId),
  ]);
  if (items.error || types.error) {
    throw new Error("Could not load compliance", { cause: (items.error ?? types.error)?.code });
  }

  const documentIds = items.data.flatMap((item) => (item.document_id ? [item.document_id] : []));
  const { data: documents } = documentIds.length
    ? await supabase.from("documents").select("id, file_name").in("id", documentIds)
    : { data: [] };
  const counts = ragCounts(items.data);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeading
        title="Compliance"
        description={
          <>
            {counts.red} overdue or missing · {counts.amber} due soon · {counts.green} OK
            {counts.grey ? ` · ${counts.grey} not needed` : ""}.{" "}
            {membership.role === "admin" ? (
              <Link href="/settings/compliance" className="underline underline-offset-4">
                Change the types and alert windows
              </Link>
            ) : null}
          </>
        }
      />
      <PropertyCompliance
        orgId={membership.orgId}
        propertyId={propertyId}
        today={todayInLondon()}
        items={[...items.data].sort(byUrgency)}
        fieldsByType={Object.fromEntries(
          types.data.map((type) => [type.id, type.fields as ServiceField[]]),
        )}
        documentNames={Object.fromEntries(
          (documents ?? []).map((document) => [document.id, document.file_name]),
        )}
        address={property.address_line_1}
        recipients={recipients}
        records={records}
      />
    </div>
  );
}
