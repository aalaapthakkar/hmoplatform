import { escapeHtml } from "@/lib/email/html";

/** A tenant who can be given a certificate: on a current, ending or upcoming tenancy. */
export type ServeRecipient = {
  tenancyId: string;
  tenantId: string;
  name: string;
  firstName: string;
  email: string | null;
  roomName: string;
};

export type ServeTenancyRow = {
  id: string;
  status: string;
  rooms: { name: string } | null;
  tenancy_tenants: {
    status: string;
    tenants: { id: string; first_name: string; last_name: string; email: string | null } | null;
  }[];
};

/**
 * Everyone a certificate should go to: each active tenant on each tenancy
 * that is current, ending or about to start. A tenant on two tenancies is
 * listed for each, so both tenancies' portals get it.
 */
export function recipientsFrom(tenancies: ServeTenancyRow[]): ServeRecipient[] {
  return tenancies
    .filter((tenancy) => ["prospective", "active", "ending"].includes(tenancy.status))
    .flatMap((tenancy) =>
      tenancy.tenancy_tenants
        .filter((link) => link.status === "active" && link.tenants)
        .map((link) => {
          const tenant = link.tenants!;
          const email = tenant.email?.trim() || null;
          return {
            tenancyId: tenancy.id,
            tenantId: tenant.id,
            name: `${tenant.first_name} ${tenant.last_name}`,
            firstName: tenant.first_name,
            email,
            roomName: tenancy.rooms?.name ?? "",
          };
        }),
    )
    .sort(
      (a, b) =>
        a.roomName.localeCompare(b.roomName, "en-GB", { numeric: true }) ||
        a.name.localeCompare(b.name),
    );
}

/** The email a tenant gets with the certificate attached. */
export function serveEmail({
  firstName,
  message,
  organisation,
}: {
  firstName: string;
  message: string;
  organisation: string;
}) {
  const portal = "You can also find it in your tenant portal, under More, then Documents.";
  const text = [`Hi ${firstName},`, "", message, "", portal, "", "Thanks,", organisation].join(
    "\n",
  );
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#171717;max-width:560px">
<p>Hi ${escapeHtml(firstName)},</p>
${message
  .split(/\n{2,}/)
  .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
  .join("\n")}
<p>${escapeHtml(portal)}</p>
<p>Thanks,<br>${escapeHtml(organisation)}</p>
</div>`;
  return { text, html };
}

/** The suggested subject and message for serving a certificate. */
export function defaultServeMessage(certificate: string, address: string) {
  return {
    subject: `Your ${certificate.toLowerCase()} for ${address}`,
    message: `Here's the latest ${certificate.toLowerCase()} for ${address}. It's attached to this email for your records.`,
  };
}
