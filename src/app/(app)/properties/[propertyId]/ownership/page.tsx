import type { Metadata } from "next";
import { Suspense } from "react";
import { OwnershipSection } from "@/components/properties/ownership-section";
import { SectionFallback } from "@/components/properties/section-heading";
import { formatPence } from "@/lib/format";
import { getOwners, getProperty } from "@/lib/properties/queries";
import { penceToPounds } from "@/lib/properties/rooms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ownership" };

const OWNERSHIP_LABELS = {
  owned: "Owned",
  managed: "Managed for an owner",
  master_lease: "Master lease (rent to rent)",
} as const;

export default function OwnershipPage({ params }: PageProps<"/properties/[propertyId]/ownership">) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Ownership params={params} />
    </Suspense>
  );
}

async function Ownership({
  params,
}: Pick<PageProps<"/properties/[propertyId]/ownership">, "params">) {
  const { propertyId } = await params;
  const [property, owners] = await Promise.all([getProperty(propertyId), getOwners()]);

  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("property_owners")
    .select("owners (id, name, email, phone)")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Could not load the owner", { cause: error.code });

  const owner = links[0]?.owners ?? null;
  const ownerMode = owner
    ? "existing"
    : property.ownership_type === "master_lease"
      ? "none"
      : owners.length > 0
        ? "existing"
        : "new";

  return (
    <OwnershipSection
      propertyId={propertyId}
      ownershipLabel={OWNERSHIP_LABELS[property.ownership_type]}
      headRent={
        property.head_rent_pence === null
          ? null
          : `${formatPence(property.head_rent_pence)} per month`
      }
      owner={owner}
      owners={owners}
      initial={{
        ownershipType: property.ownership_type,
        headRent: penceToPounds(property.head_rent_pence),
        ownerMode,
        ownerId: owner?.id ?? "",
        ownerName: "",
        ownerEmail: "",
        ownerPhone: "",
      }}
    />
  );
}
