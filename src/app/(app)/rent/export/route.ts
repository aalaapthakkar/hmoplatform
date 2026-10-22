import { requireMembership } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/format";
import {
  buildCollection,
  collectionCsv,
  filterCollection,
  parseCollectionFilters,
} from "@/lib/rent/collection";
import { getOrgLedgers } from "@/lib/rent/org-ledgers";

/**
 * The Rent page as a CSV file, with the same filters. Tenant names only: no
 * emails or phone numbers leave the app this way.
 */
export async function GET(request: Request) {
  const membership = await requireMembership();
  const filters = parseCollectionFilters(
    Object.fromEntries(new URL(request.url).searchParams),
    todayInLondon(),
  );
  const sources = await getOrgLedgers(membership.orgId, { propertyId: filters.property });
  const rows = filterCollection(buildCollection(sources, filters.month).rows, filters);

  return new Response(collectionCsv(rows, filters.month), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rent-${filters.month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
