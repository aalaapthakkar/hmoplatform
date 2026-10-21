import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";
import { TEMPLATE_KIND_LABELS } from "@/lib/documents/merge";
import { formatUkDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Document templates" };

export default function DocumentTemplatesPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/settings"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Document templates</h1>
        <p className="text-muted-foreground">
          The wording for tenancy and guarantor agreements. Fields like {"{{tenant_name}}"} are
          filled in from each tenancy.
        </p>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <Templates />
      </Suspense>
    </div>
  );
}

async function Templates() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, kind, name, is_draft, updated_at")
    .eq("org_id", membership.orgId)
    .eq("status", "active")
    .order("kind");
  if (error) throw new Error("Could not load templates", { cause: error.code });

  return (
    <ul className="flex flex-col gap-3">
      {data.map((template) => (
        <li key={template.id}>
          <Link
            href={`/settings/documents/${template.id}`}
            className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {template.name}
                  {template.is_draft ? (
                    <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                      DRAFT
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {TEMPLATE_KIND_LABELS[template.kind]} · last changed{" "}
                  {formatUkDate(template.updated_at)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
