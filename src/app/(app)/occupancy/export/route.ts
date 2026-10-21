import { todayInLondon } from "@/lib/format";
import { filterOccupancy, occupancyCsv, parseOccupancyFilters } from "@/lib/occupancy";
import { getOccupancy } from "@/lib/occupancy-query";

/**
 * The Occupancy page as a CSV file, with the same filters. Tenant names
 * only: no emails or phone numbers leave the app this way.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const rows = filterOccupancy(await getOccupancy(), parseOccupancyFilters(params));

  return new Response(occupancyCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="occupancy-${todayInLondon()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
