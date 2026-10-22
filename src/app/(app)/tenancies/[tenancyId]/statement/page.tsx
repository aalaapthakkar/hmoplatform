import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatementSummary } from "@/components/rent/statement-list";
import { StaffStatementTools } from "@/components/rent/staff-statement-tools";
import { buttonVariants } from "@/components/ui/button";
import { formatUkDate, todayInLondon } from "@/lib/format";
import { getStaffStatement } from "@/lib/rent/queries";

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
  const { tenancy, ledger, details } = await getStaffStatement(tenancyId);
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Rent statement: {details.tenantNames}
          </h1>
          <p className="text-sm text-muted-foreground">
            {details.rent} · from {formatUkDate(tenancy.start_date)}
            {tenancy.end_date ? ` to ${formatUkDate(tenancy.end_date)}` : ""}
          </p>
        </div>
        <a
          href={`/tenancies/${tenancy.id}/statement/pdf`}
          className={buttonVariants({ variant: "outline" })}
        >
          <Download aria-hidden />
          Download PDF
        </a>
      </header>

      <StatementSummary
        ledger={ledger}
        footnote={
          tenancy.status === "prospective"
            ? "Rent charges start on the move-in date."
            : "The tenant sees the same statement in their portal."
        }
      />

      <StaffStatementTools tenancyId={tenancy.id} today={todayInLondon()} lines={ledger.lines} />
    </>
  );
}
