import type { Metadata } from "next";
import { Suspense } from "react";
import { sendTenantMessage } from "@/app/portal/(tenant)/actions";
import { MessageComposer } from "@/components/messages/message-composer";
import { MessageThread } from "@/components/messages/message-thread";
import { NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { requireTenant } from "@/lib/portal/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

export default function PortalMessagesPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <Messages />
    </Suspense>
  );
}

async function Messages() {
  const { userId, home } = await requireTenant();
  if (!home) {
    return (
      <>
        <PortalHeading title="Messages" />
        <NoTenancyYet />
      </>
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender, author_user_id, body, created_at")
    .eq("tenancy_id", home.tenancyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load messages", { cause: error.code });

  return (
    <>
      <PortalHeading title="Messages">
        Your conversation with {home.organisation}. For emergencies, phone them as well.
      </PortalHeading>
      <MessageThread
        empty="No messages yet. Ask a question or let us know how things are going."
        messages={data.map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.created_at,
          mine: message.sender === "tenant",
          who:
            message.sender === "staff"
              ? home.organisation
              : message.author_user_id === userId
                ? "You"
                : "Your joint tenant",
        }))}
      />
      <MessageComposer send={sendTenantMessage} />
    </>
  );
}
