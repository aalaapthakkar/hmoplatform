import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { sendStaffMessage } from "@/app/(app)/messages/actions";
import { MessageComposer } from "@/components/messages/message-composer";
import { MessageThread } from "@/components/messages/message-thread";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { getTenancyLabels } from "@/lib/messages/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversation" };

type Props = PageProps<"/messages/[tenancyId]">;

export default function ConversationPage({ params }: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/messages"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Messages
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: Pick<Props, "params">) {
  const { tenancyId } = await params;
  if (!z.uuid().safeParse(tenancyId).success) notFound();
  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const label = (await getTenancyLabels([tenancyId])).get(tenancyId);
  if (!label) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender, author_user_id, body, created_at")
    .eq("tenancy_id", tenancyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load messages", { cause: error.code });

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{label.names}</h1>
        <p className="text-muted-foreground">
          {label.roomHref ? (
            <Link href={label.roomHref} className="underline-offset-4 hover:underline">
              {label.place}
            </Link>
          ) : (
            label.place
          )}
        </p>
      </header>
      <MessageThread
        empty="No messages yet. Tenants who have joined the portal see what you send here."
        messages={data.map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.created_at,
          mine: message.sender === "staff",
          who:
            message.sender === "staff"
              ? message.author_user_id === user.id
                ? "You"
                : membership.orgName
              : ((message.author_user_id && label.byUser.get(message.author_user_id)) ?? "Tenant"),
        }))}
      />
      <MessageComposer send={sendStaffMessage.bind(null, tenancyId)} label="Your reply" />
    </>
  );
}
