import { PoundSterling } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoonSection } from "@/components/properties/coming-soon-section";

export const metadata: Metadata = { title: "Rent" };

export default function RentPage() {
  return (
    <ComingSoonSection
      title="Rent"
      icon={PoundSterling}
      summary="See what's due, what's been paid and who's behind, room by room."
      items={[
        "See each tenant's rent charges, payments and balance",
        "Spot arrears early",
        "Compare rent coming in with the head rent and costs going out",
      ]}
    />
  );
}
