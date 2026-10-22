import { NextResponse } from "next/server";
import { todayInLondon } from "@/lib/format";
import { getTenantStatement } from "@/lib/rent/queries";
import { renderStatementPdf, statementFileName } from "@/lib/rent/statement-pdf";

/**
 * The signed-in tenant's own rent statement as a PDF. RLS only ever gives a
 * tenant their own tenancy's ledger. Made fresh each time, never stored.
 */
export async function GET() {
  const statement = await getTenantStatement();
  if (!statement) return new NextResponse("There's no statement to show yet.", { status: 404 });
  const today = todayInLondon();
  const pdf = await renderStatementPdf(statement.details, statement.ledger, today);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${statementFileName(today)}"`,
      "Cache-Control": "no-store",
    },
  });
}
