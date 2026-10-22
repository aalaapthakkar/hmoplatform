import { requireMembership } from "@/lib/auth/session";
import { complianceCsv, listItems, parseComplianceFilters } from "@/lib/compliance/dashboard";
import { getComplianceOverview } from "@/lib/compliance/queries";
import { todayInLondon } from "@/lib/format";

/** The compliance dashboard as a CSV file, with the same filters, worst first. */
export async function GET(request: Request) {
  const membership = await requireMembership();
  const filters = parseComplianceFilters(Object.fromEntries(new URL(request.url).searchParams));
  const { items, propertyLabels, fieldsByType } = await getComplianceOverview(membership.orgId);

  return new Response(complianceCsv(listItems(items, filters), propertyLabels, fieldsByType), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-${todayInLondon()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
