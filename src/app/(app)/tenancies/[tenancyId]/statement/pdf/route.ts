import { NextResponse } from "next/server";
import { todayInLondon } from "@/lib/format";
import { getStaffStatement } from "@/lib/rent/queries";
import { renderStatementPdf, statementFileName } from "@/lib/rent/statement-pdf";

/** A tenancy's rent statement as a PDF, for staff. Made fresh each time, never stored. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/tenancies/[tenancyId]/statement/pdf">,
) {
  const { tenancyId } = await params;
  const { ledger, details } = await getStaffStatement(tenancyId);
  const today = todayInLondon();
  const pdf = await renderStatementPdf(details, ledger, today);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${statementFileName(today)}"`,
      "Cache-Control": "no-store",
    },
  });
}
