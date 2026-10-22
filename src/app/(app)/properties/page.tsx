import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PropertyCard } from "@/components/properties/property-card";
import { PropertyFiltersBar } from "@/components/properties/property-filters";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/session";
import { overdueCounts } from "@/lib/compliance/queries";
import {
  allTags,
  groupProperties,
  parsePropertyFilters,
  type PropertyListRow,
  propertiesHref,
  summariseProperty,
} from "@/lib/properties/summary";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Properties" };

export default function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">Your houses and flats, grouped by tag.</p>
        </div>
        <AddPropertyLink />
      </div>
      <Suspense fallback={<PropertiesFallback />}>
        <PropertiesList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PROPERTY_LIST_COLUMNS = `
  id, address_line_1, address_line_2, town, postcode, tags, status, letting_type,
  rooms (status)
`;

async function PropertiesList({ searchParams }: Pick<PageProps<"/properties">, "searchParams">) {
  const [membership, params] = await Promise.all([requireMembership(), searchParams]);
  const filters = parsePropertyFilters(params);

  const supabase = await createClient();
  const [{ data, error }, overdue] = await Promise.all([
    supabase
      .from("properties")
      .select(PROPERTY_LIST_COLUMNS)
      .eq("org_id", membership.orgId)
      .order("address_line_1")
      .overrideTypes<PropertyListRow[], { merge: false }>(),
    overdueCounts(membership.orgId),
  ]);

  if (error) throw new Error("Could not load properties", { cause: error.code });

  const properties = data.map((row) => summariseProperty(row, overdue.get(row.id) ?? 0));

  if (properties.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">You haven&apos;t added any properties yet.</p>
        <p className="mb-4 text-sm text-muted-foreground">
          Add a house or flat and we&apos;ll set up its rooms for you. It takes about a minute.
        </p>
        <AddPropertyLink />
      </div>
    );
  }

  const groups = groupProperties(properties, filters);

  return (
    <>
      <PropertyFiltersBar filters={filters} tags={allTags(properties)} />

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No properties match these filters.</p>
          <Link
            href={propertiesHref({ status: "all" })}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Show all properties
          </Link>
        </div>
      ) : (
        groups.map((group) => {
          const heading = group.tag ?? "No tag";
          return (
            <section key={heading} aria-label={heading} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">
                {heading}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({group.properties.length})
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.properties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function AddPropertyLink() {
  return (
    <Link href="/properties/new" className={buttonVariants({ size: "lg" })}>
      <Plus aria-hidden />
      Add property
    </Link>
  );
}

function PropertiesFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="h-64 animate-pulse rounded-xl bg-muted" />
      ))}
      <span className="sr-only">Loading properties…</span>
    </div>
  );
}
