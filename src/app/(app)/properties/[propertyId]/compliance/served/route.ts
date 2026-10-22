import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { getServiceRecords } from "@/lib/compliance/queries";
import { formatUkDateTime, todayInLondon } from "@/lib/format";
import { csvCell } from "@/lib/occupancy";

const HOW = {
  sent: "Emailed (attached) and in their portal",
  failed: "In their portal; email failed",
  no_email: "In their portal (no email address)",
} as const;

/**
 * The record of every certificate served at a property, one row per tenant:
 * what was sent, to whom, how, by whom and when. For proving service.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/properties/[propertyId]/compliance/served">,
) {
  const { propertyId } = await params;
  if (!z.uuid().safeParse(propertyId).success) {
    return new Response("Not found", { status: 404 });
  }
  await requireMembership();
  const records = await getServiceRecords(propertyId);
  const header = ["Sent", "Sent by", "Subject", "Tenant", "Email", "How", "Problem"];
  const lines = [
    header.map(csvCell).join(","),
    ...records.flatMap((record) =>
      record.recipients.map((recipient) =>
        [
          formatUkDateTime(record.sentAt),
          record.sentBy ?? "",
          record.subject,
          recipient.name,
          recipient.email ?? "",
          HOW[recipient.emailStatus],
          recipient.error ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ),
  ];
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="certificates-served-${todayInLondon()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
