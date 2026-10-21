import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";

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
        <Card>
          <CardHeader>
            <CardTitle>Tenancies and rent</CardTitle>
            <CardDescription>Track who lives where and what they owe. Coming soon.</CardDescription>
          </CardHeader>
        </Card>
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
