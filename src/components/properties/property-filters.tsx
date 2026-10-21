"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
  type PropertyFilters,
  type PropertyStatusFilter,
  propertiesHref,
} from "@/lib/properties/summary";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<PropertyStatusFilter, string> = {
  active: "Active",
  inactive: "Inactive",
  all: "All",
};

type PropertyFiltersBarProps = {
  filters: PropertyFilters;
  tags: string[];
};

export function PropertyFiltersBar({ filters, tags }: PropertyFiltersBarProps) {
  const router = useRouter();
  const tagSelectId = useId();
  // Keep a tag that's in the URL selectable even if no property uses it any more.
  const tagOptions = filters.tag && !tags.includes(filters.tag) ? [filters.tag, ...tags] : tags;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={tagSelectId}>Tag</Label>
        <select
          id={tagSelectId}
          value={filters.tag ?? ""}
          onChange={(event) =>
            router.push(propertiesHref({ ...filters, tag: event.target.value || undefined }))
          }
          className="h-8 min-w-44 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">All tags</option>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <nav aria-label="Property status" className="flex rounded-lg border p-0.5">
        {(Object.keys(STATUS_LABELS) as PropertyStatusFilter[]).map((status) => {
          const current = filters.status === status;
          return (
            <Link
              key={status}
              href={propertiesHref({ ...filters, status })}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors hover:bg-muted",
                current && "bg-muted font-medium",
              )}
            >
              {STATUS_LABELS[status]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
