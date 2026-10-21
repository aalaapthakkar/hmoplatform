import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailsSection } from "@/components/properties/details-section";
import { SectionFallback } from "@/components/properties/section-heading";
import { getProperty } from "@/lib/properties/queries";
import { detailsFormValues } from "@/lib/validation/details";

export const metadata: Metadata = { title: "Details" };

export default function DetailsPage({ params }: PageProps<"/properties/[propertyId]/details">) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Details params={params} />
    </Suspense>
  );
}

async function Details({ params }: Pick<PageProps<"/properties/[propertyId]/details">, "params">) {
  const { propertyId } = await params;
  const property = await getProperty(propertyId);
  return <DetailsSection propertyId={propertyId} initial={detailsFormValues(property)} />;
}
