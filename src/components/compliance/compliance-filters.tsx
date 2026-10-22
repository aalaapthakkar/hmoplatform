"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { selectClass } from "@/components/forms/fields";
import { Label } from "@/components/ui/label";
import {
  complianceQuery,
  type ComplianceFilters,
  RAGS,
  WITHIN_OPTIONS,
} from "@/lib/compliance/dashboard";
import { CATEGORIES, CATEGORY_LABELS, RAG_LABELS } from "@/lib/compliance/status";
import { cn } from "@/lib/utils";

/** Status, category, property, "due within" and grid or list, kept in the URL. */
export function ComplianceFiltersBar({
  filters,
  properties,
}: {
  filters: ComplianceFilters;
  properties: { id: string; name: string }[];
}) {
  const router = useRouter();
  const ids = { category: useId(), property: useId(), within: useId() };
  const go = (changes: Partial<ComplianceFilters>) =>
    router.push(`/compliance${complianceQuery({ ...filters, ...changes })}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max rounded-lg border p-0.5">
            {[undefined, ...RAGS].map((rag) => (
              <li key={rag ?? "all"}>
                <Link
                  href={`/compliance${complianceQuery({ ...filters, rag })}`}
                  aria-current={filters.rag === rag ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors hover:bg-muted",
                    filters.rag === rag && "bg-muted font-medium",
                  )}
                >
                  {rag ? RAG_LABELS[rag] : "All"}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="View" className="hidden md:block">
          <ul className="flex w-max rounded-lg border p-0.5">
            {(["grid", "list"] as const).map((view) => (
              <li key={view}>
                <Link
                  href={`/compliance${complianceQuery({ ...filters, view })}`}
                  aria-current={filters.view === view ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1 text-sm transition-colors hover:bg-muted",
                    filters.view === view && "bg-muted font-medium",
                  )}
                >
                  {view === "grid" ? "Grid" : "List"}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.category}>Category</Label>
          <select
            id={ids.category}
            value={filters.category ?? ""}
            onChange={(event) =>
              go({ category: (event.target.value || undefined) as ComplianceFilters["category"] })
            }
            className={selectClass}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.property}>Property</Label>
          <select
            id={ids.property}
            value={filters.property ?? ""}
            onChange={(event) => go({ property: event.target.value || undefined })}
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
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.within}>Due within</Label>
          <select
            id={ids.within}
            value={filters.within ?? ""}
            onChange={(event) => go({ within: Number(event.target.value) || undefined })}
            className={selectClass}
          >
            <option value="">Any time</option>
            {WITHIN_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days (and overdue)
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
