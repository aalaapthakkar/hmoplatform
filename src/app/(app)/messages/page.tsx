import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { requireMembership } from "@/lib/auth/session";
import { formatUkDateTime } from "@/lib/format";
import { getTenancyLabels } from "@/lib/messages/queries";
import { snippet, summariseThreads } from "@/lib/messages/threads";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

/** How many recent messages the list looks through. */
const RECENT = 1000;

export default function MessagesPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-muted-foreground">
          Conversations with tenants through their portal, newest first. To start one, open the
          tenancy on its room page.
        </p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Threads />
      </Suspense>
    </div>
  );
}

async function Threads() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, tenancy_id, sender, author_user_id, body, created_at")
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: false })
    .limit(RECENT);
  if (error) throw new Error("Could not load messages", { cause: error.code });

  const threads = summariseThreads(data);
  const labels = await getTenancyLabels(threads.map((thread) => thread.tenancyId));

  if (threads.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No messages yet. When tenants message you from their portal, they appear here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border" aria-label="Conversations">
      {threads.map((thread) => {
        const label = labels.get(thread.tenancyId);
        return (
          <li key={thread.tenancyId}>
            <Link
              href={`/messages/${thread.tenancyId}`}
              className="flex flex-col gap-1 p-4 hover:bg-muted/50"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{label?.names ?? "Tenancy"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatUkDateTime(thread.latest.created_at)}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">{label?.place}</span>
              <span className="flex items-center gap-2 text-sm">
                {thread.awaitingReply ? <Badge>Needs a reply</Badge> : null}
                <span className="truncate">
                  {thread.latest.sender === "staff" ? "You: " : ""}
                  {snippet(thread.latest.body)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
