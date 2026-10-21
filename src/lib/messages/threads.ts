import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type MessageRow = Pick<
  Tables["messages"]["Row"],
  "id" | "tenancy_id" | "sender" | "author_user_id" | "body" | "created_at"
>;

export type ThreadSummary = {
  tenancyId: string;
  latest: MessageRow;
  count: number;
  /** The tenant spoke last, so the team owes a reply. */
  awaitingReply: boolean;
};

/** One summary per tenancy, most recent conversation first. */
export function summariseThreads(messages: MessageRow[]): ThreadSummary[] {
  const threads = new Map<string, ThreadSummary>();
  for (const message of messages) {
    const thread = threads.get(message.tenancy_id);
    if (!thread) {
      threads.set(message.tenancy_id, {
        tenancyId: message.tenancy_id,
        latest: message,
        count: 1,
        awaitingReply: message.sender === "tenant",
      });
      continue;
    }
    thread.count += 1;
    if (message.created_at > thread.latest.created_at) {
      thread.latest = message;
      thread.awaitingReply = message.sender === "tenant";
    }
  }
  return [...threads.values()].sort((a, b) =>
    b.latest.created_at.localeCompare(a.latest.created_at),
  );
}

/** The start of a message, for a list. */
export function snippet(body: string, length = 90) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}
