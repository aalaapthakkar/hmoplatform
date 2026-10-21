import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OccupancyFiltersBar } from "@/components/occupancy/occupancy-filters";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  filterOccupancy,
  type OccupancyRow,
  type OccupancyStatus,
  occupancyQuery,
  occupancySummary,
  parseOccupancyFilters,
} from "@/lib/occupancy";
import { getOccupancy } from "@/lib/occupancy-query";

export const metadata: Metadata = { title: "Occupancy" };

export default function OccupancyPage({ searchParams }: PageProps<"/occupancy">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Occupancy</h1>
        <p className="text-muted-foreground">
          Every room, who&apos;s in it and when it&apos;s free.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Occupancy searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const STATUS_BADGES: Record<OccupancyStatus, "default" | "secondary" | "outline"> = {
  let: "default",
  notice: "secondary",
  vacant: "outline",
  unavailable: "outline",
};

async function Occupancy({ searchParams }: Pick<PageProps<"/occupancy">, "searchParams">) {
  const [all, params] = await Promise.all([getOccupancy(), searchParams]);
  const filters = parseOccupancyFilters(params);
  const rows = filterOccupancy(all, filters);
  const properties = [...new Map(all.map((row) => [row.propertyId, row.property])).entries()].map(
    ([id, name]) => ({ id, name }),
  );

  if (all.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">No rooms yet.</p>
        <Link
          href="/properties/new"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Add a property
        </Link>
      </div>
    );
  }

  return (
    <>
      <OccupancyFiltersBar filters={filters} properties={properties} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="occupancy-summary">
          {occupancySummary(rows)}
        </p>
        <a
          href={`/occupancy/export${occupancyQuery(filters)}`}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          <Download aria-hidden />
          Download CSV
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No rooms match these filters.
        </p>
      ) : (
        <>
          {/* Wider screens: a table. */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Room
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Tenant
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Rent
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Moved in
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Vacant from
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Next tenant
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.roomId} className="border-t" data-testid="occupancy-row">
                    <td className="px-4 py-2">
                      <RoomLink row={row} />
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={STATUS_BADGES[row.status]}>{row.statusLabel}</Badge>
                    </td>
                    <td className="px-4 py-2">{row.tenant || "–"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{row.rent}</td>
                    <td className="px-4 py-2">{row.moveIn || "–"}</td>
                    <td className="px-4 py-2">{row.vacancy || "–"}</td>
                    <td className="px-4 py-2">{row.nextMoveIn || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per room. */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Rooms">
            {rows.map((row) => (
              <li key={row.roomId} className="flex flex-col gap-1 rounded-xl border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <RoomLink row={row} />
                  <Badge variant={STATUS_BADGES[row.status]}>{row.statusLabel}</Badge>
                </div>
                {row.tenant ? <p>{row.tenant}</p> : null}
                <p className="text-muted-foreground">{row.rent}</p>
                <p className="text-muted-foreground">
                  {[
                    row.moveIn ? `Moved in ${row.moveIn}` : null,
                    row.vacancy
                      ? `Vacant ${row.vacancy === "Now" ? "now" : `from ${row.vacancy}`}`
                      : null,
                    row.nextMoveIn ? `Next tenant from ${row.nextMoveIn}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function RoomLink({ row }: { row: OccupancyRow }) {
  return (
    <Link
      href={`/properties/${row.propertyId}/rooms/${row.roomId}`}
      className="flex flex-col underline-offset-4 hover:underline"
    >
      <span className="font-medium">{row.room}</span>
      <span className="text-xs text-muted-foreground">
        {row.property}, {row.postcode}
      </span>
    </Link>
  );
}
