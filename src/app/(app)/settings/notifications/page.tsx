import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ComplianceEmailsToggle } from "@/components/settings/compliance-emails-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { buildDigest } from "@/lib/compliance/digest";
import { getComplianceOverview } from "@/lib/compliance/queries";
import { getPublicEnv } from "@/lib/env";
import { formatUkDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/settings"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Settings
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <Notifications />
      </Suspense>
    </div>
  );
}

async function Notifications() {
  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();
  const [{ data: mine }, overview] = await Promise.all([
    supabase
      .from("memberships")
      .select("compliance_emails")
      .eq("user_id", user.id)
      .eq("org_id", membership.orgId)
      .maybeSingle(),
    getComplianceOverview(membership.orgId),
  ]);

  // What's due or overdue now: what the email covers (each item once per date).
  const due = overview.items.filter(
    (item) => (item.status === "due_soon" || item.status === "overdue") && item.expires_on,
  );
  const digest = buildDigest({
    firstName: null,
    organisation: membership.orgName,
    siteUrl: getPublicEnv().NEXT_PUBLIC_SITE_URL,
    items: due.map((item) => ({
      propertyId: item.property_id,
      propertyLabel: overview.propertyLabels.get(item.property_id) ?? "",
      serviceName: item.service_name,
      expiresOn: item.expires_on!,
      kind: item.status === "overdue" ? "overdue" : "due_soon",
    })),
  });

  return (
    <>
      <ComplianceEmailsToggle on={mine?.compliance_emails ?? false} />
      {user.email ? (
        <p className="text-sm text-muted-foreground">Emails go to {user.email}.</p>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="text-lg font-semibold">
          What&apos;s due now
        </h2>
        <p className="text-sm text-muted-foreground">
          These are what reminders cover today. Each one is emailed once when it enters its alert
          window and again if it goes overdue.
        </p>
        {due.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing is due soon or overdue.
          </p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <p className="font-medium" data-testid="digest-subject">
                {digest.subject}
              </p>
              <ul className="flex flex-col divide-y text-sm" aria-label="Due now">
                {due.map((item) => (
                  <li key={`${item.property_id}-${item.service_type_id}`} className="py-2">
                    <Link
                      href={`/properties/${item.property_id}/compliance`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {item.service_name}
                    </Link>
                    <span className="block text-muted-foreground">
                      {overview.propertyLabels.get(item.property_id)} ·{" "}
                      {item.status === "overdue" ? "expired on" : "due by"}{" "}
                      {formatUkDate(item.expires_on!)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
