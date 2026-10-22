import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/session";
import { validityLabel } from "@/lib/compliance/service-type";
import { CATEGORY_LABELS } from "@/lib/compliance/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compliance types" };

export default function ComplianceTypesPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/settings"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compliance types</h1>
        <p className="text-muted-foreground">
          The checks, certificates and licences every property is measured against. Check the
          periods and alert windows against your own policies and current guidance.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Types />
      </Suspense>
    </div>
  );
}

async function Types() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_types")
    .select("id, name, category, validity_months, alert_window_days, auto_create_job, status")
    .eq("org_id", membership.orgId)
    .order("status")
    .order("name");
  if (error) throw new Error("Could not load compliance types", { cause: error.code });

  return (
    <>
      {membership.role === "admin" ? (
        <div>
          <Link href="/settings/compliance/new" className={buttonVariants()}>
            <Plus aria-hidden />
            Add a type
          </Link>
        </div>
      ) : null}
      <ul className="flex flex-col divide-y rounded-xl border" aria-label="Compliance types">
        {data.map((type) => (
          <li key={type.id}>
            <Link
              href={`/settings/compliance/${type.id}`}
              className="flex flex-col gap-1 p-4 hover:bg-muted/50"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{type.name}</span>
                {type.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
              </span>
              <span className="text-sm text-muted-foreground">
                {CATEGORY_LABELS[type.category]} · {validityLabel(type.validity_months)} · alert{" "}
                {type.alert_window_days} days before
                {type.auto_create_job ? " · opens a maintenance job" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
