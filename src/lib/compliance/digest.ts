import { escapeHtml } from "@/lib/email/html";
import { formatUkDate } from "@/lib/format";

export type DigestItem = {
  propertyId: string;
  propertyLabel: string;
  serviceName: string;
  expiresOn: string;
  kind: "due_soon" | "overdue";
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The daily compliance email for one person: overdue items first, then
 * what's coming due, each with its property and a link.
 */
export function buildDigest({
  firstName,
  organisation,
  items,
  siteUrl,
}: {
  firstName: string | null;
  organisation: string;
  items: DigestItem[];
  siteUrl: string;
}) {
  const sorted = [...items].sort(
    (a, b) =>
      Number(b.kind === "overdue") - Number(a.kind === "overdue") ||
      a.expiresOn.localeCompare(b.expiresOn) ||
      a.propertyLabel.localeCompare(b.propertyLabel),
  );
  const overdue = sorted.filter((item) => item.kind === "overdue").length;
  const subject =
    overdue > 0
      ? `${overdue} compliance ${plural(overdue, "item is", "items are")} overdue at ${organisation}`
      : `${items.length} compliance ${plural(items.length, "item is", "items are")} coming due at ${organisation}`;

  const describe = (item: DigestItem) =>
    item.kind === "overdue"
      ? `expired on ${formatUkDate(item.expiresOn)}`
      : `due by ${formatUkDate(item.expiresOn)}`;
  const link = (item: DigestItem) => `${siteUrl}/properties/${item.propertyId}/compliance`;
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";

  const text = [
    greeting,
    "",
    `These need attention at ${organisation}:`,
    "",
    ...sorted.map(
      (item) => `- ${item.serviceName}, ${item.propertyLabel}: ${describe(item)}\n  ${link(item)}`,
    ),
    "",
    `See everything: ${siteUrl}/compliance`,
    "",
    "You get this because compliance reminders are on for you. Turn them off in Settings, Notifications.",
  ].join("\n");

  const rows = sorted
    .map(
      (item) => `<tr>
  <td style="padding:8px 12px 8px 0;border-top:1px solid #e5e5e5">
    <strong>${escapeHtml(item.serviceName)}</strong><br>
    <a href="${escapeHtml(link(item))}" style="color:#525252">${escapeHtml(item.propertyLabel)}</a>
  </td>
  <td style="padding:8px 0;border-top:1px solid #e5e5e5;white-space:nowrap;color:${item.kind === "overdue" ? "#b91c1c" : "#92400e"}">
    ${item.kind === "overdue" ? "Overdue" : "Due soon"}<br>${escapeHtml(describe(item))}
  </td>
</tr>`,
    )
    .join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#171717;max-width:560px">
<p>${escapeHtml(greeting)}</p>
<p>These need attention at ${escapeHtml(organisation)}:</p>
<table style="border-collapse:collapse;width:100%">${rows}</table>
<p><a href="${escapeHtml(`${siteUrl}/compliance`)}" style="color:#171717">See everything on the compliance dashboard</a></p>
<p style="font-size:13px;color:#737373">You get this because compliance reminders are on for you. Turn them off in Settings, Notifications.</p>
</div>`;

  return { subject, text, html };
}
