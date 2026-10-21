import type { Metadata } from "next";
import Link from "next/link";
import { PortalHeading } from "@/components/portal/portal-bits";
import { RepairForm } from "@/components/portal/repair-form";

export const metadata: Metadata = { title: "Report a repair" };

export default function NewRepairPage() {
  return (
    <>
      <Link
        href="/portal/repairs"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Repairs
      </Link>
      <PortalHeading title="Report a repair">
        Tell us what&apos;s wrong and we&apos;ll arrange for it to be fixed.
      </PortalHeading>
      <RepairForm />
    </>
  );
}
