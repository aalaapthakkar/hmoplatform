"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/forms/fields";
import {
  OCCUPANCY_STATUS_LABELS,
  OCCUPANCY_STATUSES,
  type OccupancyFilters,
  occupancyQuery,
} from "@/lib/occupancy";
import { cn } from "@/lib/utils";

/** Property and status filters for the Occupancy page, kept in the URL. */
export function OccupancyFiltersBar({
  filters,
  properties,
}: {
  filters: OccupancyFilters;
  properties: { id: string; name: string }[];
}) {
  const router = useRouter();
  const propertyId = useId();
  const statuses = [undefined, ...OCCUPANCY_STATUSES] as const;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-56 flex-col gap-2">
        <Label htmlFor={propertyId}>Property</Label>
        <select
          id={propertyId}
          value={filters.property ?? ""}
          onChange={(event) =>
            router.push(
              `/occupancy${occupancyQuery({ ...filters, property: event.target.value || undefined })}`,
            )
          }
          className={selectClass}
        >
          <option value="">All properties</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </div>

      <nav aria-label="Room status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max rounded-lg border p-0.5">
          {statuses.map((status) => {
            const current = filters.status === status;
            return (
              <li key={status ?? "all"}>
                <Link
                  href={`/occupancy${occupancyQuery({ ...filters, status })}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors hover:bg-muted",
                    current && "bg-muted font-medium",
                  )}
                >
                  {status ? OCCUPANCY_STATUS_LABELS[status] : "All"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
