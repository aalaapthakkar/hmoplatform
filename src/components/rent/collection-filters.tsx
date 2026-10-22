"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { selectClass } from "@/components/forms/fields";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  COLLECTION_STATUSES,
  type CollectionFilters,
  collectionQuery,
  monthLabel,
  shiftMonth,
} from "@/lib/rent/collection";
import { CHARGE_STATUS_LABELS } from "@/lib/rent/ledger";
import { cn } from "@/lib/utils";

/** Month, property and status for the Rent collection page, kept in the URL. */
export function CollectionFiltersBar({
  basePath,
  filters,
  properties,
}: {
  basePath: string;
  filters: CollectionFilters;
  /** Leave out to hide the property filter (a single property's Rent section). */
  properties?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const propertyId = useId();
  const statuses = [undefined, ...COLLECTION_STATUSES] as const;
  const href = (changes: Partial<CollectionFilters>) =>
    `${basePath}${collectionQuery({ ...filters, ...changes })}`;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <nav aria-label="Month" className="flex items-center gap-1">
        <Link
          href={href({ month: shiftMonth(filters.month, -1) })}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label={`Previous month, ${monthLabel(shiftMonth(filters.month, -1))}`}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <span className="min-w-36 text-center font-medium" data-testid="collection-month">
          {monthLabel(filters.month)}
        </span>
        <Link
          href={href({ month: shiftMonth(filters.month, 1) })}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label={`Next month, ${monthLabel(shiftMonth(filters.month, 1))}`}
        >
          <ChevronRight aria-hidden />
        </Link>
      </nav>

      {properties ? (
        <div className="flex min-w-56 flex-col gap-2">
          <Label htmlFor={propertyId}>Property</Label>
          <select
            id={propertyId}
            value={filters.property ?? ""}
            onChange={(event) => router.push(href({ property: event.target.value || undefined }))}
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
      ) : null}

      <nav aria-label="Rent status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max rounded-lg border p-0.5">
          {statuses.map((status) => {
            const current = filters.status === status;
            return (
              <li key={status ?? "all"}>
                <Link
                  href={href({ status })}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors hover:bg-muted",
                    current && "bg-muted font-medium",
                  )}
                >
                  {status ? CHARGE_STATUS_LABELS[status] : "All"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
