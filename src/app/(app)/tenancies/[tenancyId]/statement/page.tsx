import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { StaffStatementTools } from "@/components/rent/staff-statement-tools";
import { Card, CardContent } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";
import { formatPence, formatUkDate, todayInLondon } from "@/lib/format";
import { getStatement } from "@/lib/rent/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rent statement" };

export default function StatementPage({ params }: PageProps<"/tenancies/[tenancyId]/statement">) {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Statement params={params} />
      </Suspense>
    </div>
  );
}

async function Statement({
  params,
}: Pick<PageProps<"/tenancies/[tenancyId]/statement">, "params">) {
  const { tenancyId } = await params;
  if (!z.uuid().safeParse(tenancyId).success) notFound();
  await requireMembership();
  const supabase = await createClient();
  const { data: tenancy } = await supabase
    .from("tenancies")
    .select(
      "id, status, start_date, end_date, rent_pence, rent_frequency, rent_due_day, rooms(id, name, properties(id, address_line_1)), tenancy_tenants(status, tenants(first_name, last_name))",
    )
    .eq("id", tenancyId)
    .maybeSingle();
  if (!tenancy) notFound();

  const statement = await getStatement(tenancyId);
  const tenant = tenancy.tenancy_tenants.find((link) => link.status === "active")?.tenants;
  const room = tenancy.rooms;
  const property = room?.properties;

  return (
    <>
      <Link
        href={`/properties/${property?.id}/rooms/${room?.id}?tenancy=${tenancy.id}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← {room?.name}, {property?.address_line_1}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Rent statement{tenant ? `: ${tenant.first_name} ${tenant.last_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatPence(tenancy.rent_pence)}{" "}
          {tenancy.rent_frequency === "weekly" ? "a week" : "a month"} · from{" "}
          {formatUkDate(tenancy.start_date)}
          {tenancy.end_date ? ` to ${formatUkDate(tenancy.end_date)}` : ""}
        </p>
      </header>

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
          {tenancy.status === "prospective" ? (
            <span className="text-xs text-muted-foreground">
              Rent charges start on the move-in date.
            </span>
          ) : null}
        </CardContent>
      </Card>

      <StaffStatementTools tenancyId={tenancy.id} today={todayInLondon()} lines={statement.lines} />
    </>
  );
}
