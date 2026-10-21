import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RepairCard } from "@/components/maintenance/repair-card";
import { NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { buttonVariants } from "@/components/ui/button";
import { getRepairs } from "@/lib/maintenance/queries";
import { requireTenant } from "@/lib/portal/queries";

export const metadata: Metadata = { title: "Repairs" };

export default function PortalRepairsPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PortalHeading title="Repairs" />
        <Link href="/portal/repairs/new" className={buttonVariants()}>
          <Plus aria-hidden />
          Report a repair
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Repairs />
      </Suspense>
    </>
  );
}

async function Repairs() {
  const { home } = await requireTenant();
  if (!home) return <NoTenancyYet />;
  const repairs = await getRepairs({ tenancyId: home.tenancyId });
  if (repairs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
        No repairs reported. If something breaks, report it here.
      </p>
    );
  }
  return repairs.map((repair) => <RepairCard key={repair.id} repair={repair} />);
}
