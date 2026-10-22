import { Download } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { StatementList, StatementSummary } from "@/components/rent/statement-list";
import { buttonVariants } from "@/components/ui/button";
import { getTenantStatement } from "@/lib/rent/queries";

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
  const statement = await getTenantStatement();
  if (!statement) return <NoTenancyYet />;
  const { home, ledger, details } = statement;

  return (
    <>
      <StatementSummary
        ledger={ledger}
        footnote={`${details.rent}. Payments show here once ${home.organisation} has recorded them, which can take a few days.`}
      />
      <a
        href="/portal/rent/statement.pdf"
        className={buttonVariants({ variant: "outline", className: "w-full" })}
      >
        <Download aria-hidden />
        Download statement (PDF)
      </a>
      <StatementList lines={ledger.lines} />
    </>
  );
}
