import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionFallback, SectionHeading } from "@/components/properties/section-heading";
import { CollectionView } from "@/components/rent/collection-view";
import { getProperty } from "@/lib/properties/queries";

export const metadata: Metadata = { title: "Rent" };

type Props = PageProps<"/properties/[propertyId]/rent">;

export default function PropertyRentPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Rent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Rent({ params, searchParams }: Props) {
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  await getProperty(propertyId);
  return (
    <div className="flex flex-col gap-2">
      <SectionHeading
        title="Rent"
        description="Who's paid, part paid or behind in this property, month by month."
      />
      <CollectionView
        basePath={`/properties/${propertyId}/rent`}
        params={query}
        propertyId={propertyId}
      />
    </div>
  );
}
