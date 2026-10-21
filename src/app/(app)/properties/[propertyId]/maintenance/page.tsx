import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoonSection } from "@/components/properties/coming-soon-section";

export const metadata: Metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return (
    <ComingSoonSection
      title="Maintenance"
      icon={Wrench}
      summary="Track repairs from the first report to the finished job."
      items={[
        "Log repairs reported by tenants or found on inspections",
        "Assign jobs to suppliers and follow their progress",
        "Keep photos, quotes and invoices with each job",
      ]}
    />
  );
}
