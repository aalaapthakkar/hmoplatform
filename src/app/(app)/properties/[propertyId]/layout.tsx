import { DoorOpen } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PropertySectionNav } from "@/components/properties/property-section-nav";
import { Badge } from "@/components/ui/badge";
import { requireMembership } from "@/lib/auth/session";
import { overdueCounts } from "@/lib/compliance/queries";
import { getProperty } from "@/lib/properties/queries";
import { summariseProperty } from "@/lib/properties/summary";

/** The property hub: the property's header, the section menu and the chosen section. */
export default function PropertyLayout({
  children,
  params,
}: LayoutProps<"/properties/[propertyId]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/properties"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Properties
      </Link>
      <Suspense fallback={<HeaderFallback />}>
        <PropertyHeader params={params} />
      </Suspense>
      <div className="flex flex-col gap-4 md:flex-row md:gap-8">
        <Suspense fallback={<div className="h-10 md:w-48" />}>
          <SectionNav params={params} />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

type Params = Pick<LayoutProps<"/properties/[propertyId]">, "params">;

async function PropertyHeader({ params }: Params) {
  const { propertyId } = await params;
  const property = await getProperty(propertyId);
  const membership = await requireMembership();
  const overdue = await overdueCounts(membership.orgId, propertyId);
  const summary = summariseProperty(property, overdue.get(propertyId) ?? 0);

  return (
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{summary.addressLine1}</h1>
        {summary.active ? null : <Badge variant="outline">Inactive</Badge>}
        {summary.overdue > 0 ? (
          <Link href={`/properties/${propertyId}/compliance`}>
            <Badge className="bg-destructive text-white">
              {summary.overdue} overdue
              <span className="sr-only">: expired certificates or checks</span>
            </Badge>
          </Link>
        ) : null}
      </div>
      <p className="text-muted-foreground">{summary.locality}</p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <DoorOpen className="size-4" aria-hidden />
        {summary.occupancy}
      </p>
    </header>
  );
}

async function SectionNav({ params }: Params) {
  const { propertyId } = await params;
  return <PropertySectionNav propertyId={propertyId} />;
}

function HeaderFallback() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
    </div>
  );
}
