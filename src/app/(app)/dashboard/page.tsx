import type { Metadata } from "next";
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
        <Card>
          <CardHeader>
            <CardTitle>Properties and rooms</CardTitle>
            <CardDescription>Add your houses and the rooms in them. Coming soon.</CardDescription>
          </CardHeader>
        </Card>
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
