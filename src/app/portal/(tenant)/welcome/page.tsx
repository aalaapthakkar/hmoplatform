import type { Metadata } from "next";
import { Suspense } from "react";
import { FormattedText, NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { Card, CardContent } from "@/components/ui/card";
import { toBlocks } from "@/lib/documents/merge";
import { requireTenant } from "@/lib/portal/queries";

export const metadata: Metadata = { title: "Welcome pack" };

export default function WelcomePackPage() {
  return (
    <>
      <PortalHeading title="Welcome pack" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <WelcomePack />
      </Suspense>
    </>
  );
}

async function WelcomePack() {
  const { home } = await requireTenant();
  if (!home) return <NoTenancyYet />;
  const pack = home.property.welcomePack?.trim();
  return (
    <Card>
      <CardContent data-testid="welcome-pack">
        {pack ? (
          <FormattedText blocks={toBlocks(pack)} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {home.organisation} hasn&apos;t added a welcome pack for {home.property.address} yet. It
            usually covers things like bin days, the Wi-Fi, where the meters are and who to call.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
