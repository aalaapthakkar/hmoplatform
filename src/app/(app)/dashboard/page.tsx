import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReminderActions } from "@/components/dashboard/reminder-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";
import { getOrgComplianceItems } from "@/lib/compliance/queries";
import { RAG_CLASSES, ragCounts } from "@/lib/compliance/status";
import { formatUkDate, todayInLondon } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/validation/dates";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <Welcome />
        </Suspense>
      </div>

      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
        <ComplianceCard />
      </Suspense>

      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-muted" />}>
        <ComingUp />
      </Suspense>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/properties"
          className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Properties and rooms</CardTitle>
              <CardDescription>
                See your houses, who&apos;s in each room and what needs attention.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link
          href="/rent"
          className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Rent</CardTitle>
              <CardDescription>
                Who&apos;s paid, part paid or behind this month, and log payments.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}

async function Welcome() {
  const membership = await requireMembership();
  return (
    <p className="text-muted-foreground">
      Welcome to {membership.orgName}. Here&apos;s where your day-to-day work will live.
    </p>
  );
}

/** Red and amber compliance across every property, linking to the dashboard. */
async function ComplianceCard() {
  const membership = await requireMembership();
  const counts = ragCounts(await getOrgComplianceItems(membership.orgId));
  return (
    <Card data-testid="compliance-card">
      <CardHeader>
        <CardTitle>
          <Link href="/compliance" className="underline-offset-4 hover:underline">
            Compliance
          </Link>
        </CardTitle>
        <CardDescription>Certificates, checks and licences across your properties.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Link
          href="/compliance?rag=red"
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", RAG_CLASSES.red)}
        >
          {counts.red} overdue or missing
        </Link>
        <Link
          href="/compliance?rag=amber"
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", RAG_CLASSES.amber)}
        >
          {counts.amber} due soon
        </Link>
        <Link
          href="/compliance?rag=green"
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", RAG_CLASSES.green)}
        >
          {counts.green} OK
        </Link>
      </CardContent>
    </Card>
  );
}

const COMING_UP_DAYS = 60;

/** Open reminders due in the next 60 days (and any overdue), such as right to rent follow-ups. */
async function ComingUp() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const until = addDays(todayInLondon(), COMING_UP_DAYS);
  const { data, error } = await supabase
    .from("reminders")
    .select("id, title, due_date")
    .eq("org_id", membership.orgId)
    .eq("status", "open")
    .lte("due_date", until)
    .order("due_date")
    .limit(20);
  if (error) throw new Error("Could not load reminders", { cause: error.code });

  const today = todayInLondon();
  return (
    <Card data-testid="coming-up">
      <CardHeader>
        <CardTitle>Coming up</CardTitle>
        <CardDescription>Reminders for the next {COMING_UP_DAYS} days.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due. You&apos;re all caught up.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((reminder) => (
              <li
                key={reminder.id}
                className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">{reminder.title}</span>
                  <span
                    className={
                      reminder.due_date < today ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {reminder.due_date < today ? "Overdue since" : "Due"}{" "}
                    {formatUkDate(reminder.due_date)}
                  </span>
                </div>
                <ReminderActions id={reminder.id} title={reminder.title} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
