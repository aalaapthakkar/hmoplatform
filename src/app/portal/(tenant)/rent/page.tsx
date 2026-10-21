import type { Metadata } from "next";
import { Suspense } from "react";
import { NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { StatementList } from "@/components/rent/statement-list";
import { Card, CardContent } from "@/components/ui/card";
import { rentSummary } from "@/lib/portal/home";
import { requireTenant } from "@/lib/portal/queries";
import { getStatement } from "@/lib/rent/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rent" };

export default function PortalRentPage() {
  return (
    <>
      <PortalHeading title="Rent" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Rent />
      </Suspense>
    </>
  );
}

async function Rent() {
  const { home } = await requireTenant();
  if (!home) return <NoTenancyYet />;
  const statement = await getStatement(home.tenancyId);

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Balance</span>
          <span
            className={cn(
              "text-2xl font-semibold",
              statement.balancePence > 0 && "text-destructive",
            )}
            data-testid="statement-balance"
          >
            {statement.balanceLabel}
          </span>
          <span className="text-xs text-muted-foreground">{rentSummary(home)}</span>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Payments show here once {home.organisation} has recorded them, which can take a few days.
      </p>
      <StatementList lines={statement.lines} />
    </>
  );
}
