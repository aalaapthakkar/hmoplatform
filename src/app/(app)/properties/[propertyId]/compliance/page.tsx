import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoonSection } from "@/components/properties/coming-soon-section";

export const metadata: Metadata = { title: "Compliance" };

export default function CompliancePage() {
  return (
    <ComingSoonSection
      title="Compliance"
      icon={ShieldCheck}
      summary="Keep on top of this property's safety checks and licences."
      items={[
        "See gas safety, EICR, EPC, fire safety and HMO licence dates at a glance",
        "Get reminders before anything expires",
        "Record inspections and the actions they lead to",
      ]}
    />
  );
}
