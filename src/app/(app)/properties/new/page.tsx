import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddPropertyWizard } from "@/components/properties/add-property-wizard";
import { requireMembership } from "@/lib/auth/session";
import { allTags } from "@/lib/properties/summary";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add property" };

export default function AddPropertyPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/properties"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Properties
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add a property</h1>
        <p className="text-muted-foreground">Three quick steps. You can add more detail later.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Wizard />
      </Suspense>
    </div>
  );
}

/** Loads the owners and tags the wizard offers, then renders it. */
async function Wizard() {
  const membership = await requireMembership();
  const supabase = await createClient();

  const [owners, properties] = await Promise.all([
    supabase
      .from("owners")
      .select("id, name")
      .eq("org_id", membership.orgId)
      .eq("status", "active")
      .order("name"),
    supabase.from("properties").select("tags").eq("org_id", membership.orgId),
  ]);

  if (owners.error || properties.error) {
    throw new Error("Could not load owners and tags", {
      cause: owners.error?.code ?? properties.error?.code,
    });
  }

  return <AddPropertyWizard owners={owners.data} existingTags={allTags(properties.data)} />;
}
