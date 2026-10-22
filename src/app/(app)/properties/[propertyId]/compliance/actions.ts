"use server";

import { z } from "zod";
import { type ActionResult, recordDocument } from "@/app/(app)/properties/[propertyId]/actions";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { parseDetails, type ServiceField } from "@/lib/compliance/fields";
import { expiryFrom } from "@/lib/compliance/status";
import { getServeRecipients } from "@/lib/compliance/queries";
import { serveEmail } from "@/lib/compliance/serving";
import { EmailFailed, EmailNotConfigured, type EmailProvider, getEmailProvider } from "@/lib/email";
import { todayInLondon } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { optionalDateField } from "@/lib/validation/dates";
import { DOCUMENTS_BUCKET } from "@/lib/validation/document";

const id = z.uuid();

export type CheckFormValues = {
  lastDoneOn: string;
  expiresOn: string;
  notes: string;
};

const checkSchema = z.object({
  lastDoneOn: optionalDateField.refine(
    (date) => !date || date <= todayInLondon(),
    "That date is in the future",
  ),
  expiresOn: optionalDateField,
  notes: z
    .string()
    .trim()
    .max(2000, "Use 2,000 characters or fewer")
    .transform((value) => value || null),
  details: z.record(z.string(), z.string().max(2000)).default({}),
  upload: z
    .object({ path: z.string().min(1).max(400), fileName: z.string().min(1).max(200) })
    .nullable(),
});

export type RecordCheckResult = ActionResult & { fieldErrors?: Record<string, string> };

async function loadType(serviceTypeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_types")
    .select("id, name, validity_months, document_type, fields, expiry_label")
    .eq("id", serviceTypeId)
    .maybeSingle();
  return data;
}

/**
 * Records a check, certificate or renewal for a property: the date done, the
 * expiry (worked out from the type's validity unless given), the extra
 * details, notes, and a newly uploaded certificate if there is one.
 */
export async function recordCheck(
  propertyId: string,
  serviceTypeId: string,
  input: unknown,
): Promise<RecordCheckResult> {
  if (!id.safeParse(propertyId).success || !id.safeParse(serviceTypeId).success) {
    return { status: "error", message: "Refresh the page and try again." };
  }
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Check the details and try again.",
      fieldErrors: issue ? { [String(issue.path[0])]: issue.message } : undefined,
    };
  }
  const [membership, user, type] = await Promise.all([
    requireMembership(),
    getCurrentUser(),
    loadType(serviceTypeId),
  ]);
  if (!type) return { status: "error", message: "That type isn't available any more." };

  const fields = type.fields as ServiceField[];
  const details = parseDetails(fields, parsed.data.details);
  if (!details.ok) {
    return {
      status: "error",
      message: "Check the highlighted details.",
      fieldErrors: details.errors,
    };
  }

  const { lastDoneOn, notes, upload } = parsed.data;
  const expiresOn =
    parsed.data.expiresOn || (lastDoneOn ? expiryFrom(lastDoneOn, type.validity_months) : null);
  if (!expiresOn) {
    const label = type.expiry_label.toLowerCase();
    return {
      status: "error",
      message: `Enter the ${label === "expires" ? "expiry date" : label}.`,
      fieldErrors: { expiresOn: `Enter the ${label === "expires" ? "expiry date" : label}` },
    };
  }
  if (lastDoneOn && expiresOn < lastDoneOn) {
    return {
      status: "error",
      message: "The expiry date is before the date it was done.",
      fieldErrors: { expiresOn: "This is before the date it was done" },
    };
  }

  let documentId: string | undefined;
  if (upload) {
    const recorded = await recordDocument(
      propertyId,
      {
        path: upload.path,
        fileName: upload.fileName,
        documentType: type.document_type,
        expiryDate: expiresOn,
      },
      // The check itself is saved below, with its own type.
      { updateCompliance: false },
    );
    if (recorded.status === "error" || !recorded.id) {
      return { status: "error", message: recorded.message };
    }
    documentId = recorded.id;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("property_services").upsert(
    {
      org_id: membership.orgId,
      property_id: propertyId,
      service_type_id: serviceTypeId,
      last_done_on: lastDoneOn,
      expires_on: expiresOn,
      notes,
      details: details.details,
      not_required: false,
      not_required_reason: null,
      updated_by: user.id,
      ...(documentId ? { document_id: documentId } : {}),
    },
    { onConflict: "property_id,service_type_id" },
  );
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };
  return { status: "success", message: `${type.name} recorded.` };
}

const notNeededSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say why it isn't needed")
    .max(300, "Use 300 characters or fewer"),
});

/** Marks a type as not needed at this property, with the reason. */
export async function markNotNeeded(
  propertyId: string,
  serviceTypeId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = notNeededSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Give a reason." };
  }
  if (!id.safeParse(propertyId).success || !id.safeParse(serviceTypeId).success) {
    return { status: "error", message: "Refresh the page and try again." };
  }
  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();
  const { error } = await supabase.from("property_services").upsert(
    {
      org_id: membership.orgId,
      property_id: propertyId,
      service_type_id: serviceTypeId,
      not_required: true,
      not_required_reason: parsed.data.reason,
      updated_by: user.id,
    },
    { onConflict: "property_id,service_type_id" },
  );
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };
  return { status: "success", message: "Marked as not needed here." };
}

/** Undoes "not needed": the item counts again. */
export async function markNeeded(propertyId: string, serviceTypeId: string): Promise<ActionResult> {
  if (!id.safeParse(propertyId).success || !id.safeParse(serviceTypeId).success) {
    return { status: "error", message: "Refresh the page and try again." };
  }
  const [, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("property_services")
    .update({ not_required: false, not_required_reason: null, updated_by: user.id })
    .eq("property_id", propertyId)
    .eq("service_type_id", serviceTypeId);
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };
  return { status: "success", message: "It's needed here again." };
}

const serveSchema = z.object({
  documentId: z.uuid(),
  propertyServiceId: z.uuid().nullable(),
  /** "tenancyId:tenantId" for each chosen tenant. */
  recipients: z
    .array(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i))
    .min(1, "Choose who to send it to"),
  subject: z.string().trim().min(1, "Add a subject").max(200, "Use 200 characters or fewer"),
  message: z.string().trim().min(1, "Add a message").max(4000, "Use 4,000 characters or fewer"),
});

/**
 * Serves a certificate to tenants: it goes into each tenancy's portal and is
 * emailed, attached, to every chosen tenant with an email address. Who it
 * went to, how, and whether each email got out, is recorded for good.
 */
export async function serveCertificate(propertyId: string, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(propertyId).success) {
    return { status: "error", message: "Refresh the page and try again." };
  }
  const parsed = serveSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const { documentId, propertyServiceId, subject, message } = parsed.data;
  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();

  const { data: document } = await supabase
    .from("documents")
    .select("id, file_path, file_name")
    .eq("id", documentId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .maybeSingle();
  if (!document) return { status: "error", message: "We couldn't find that certificate." };

  const chosen = new Set(parsed.data.recipients);
  const recipients = (await getServeRecipients(propertyId)).filter((recipient) =>
    chosen.has(`${recipient.tenancyId}:${recipient.tenantId}`),
  );
  if (recipients.length === 0) {
    return { status: "error", message: "None of those tenants are at this property now." };
  }

  // The file, read through the staff member's own session.
  const emailing = recipients.some((recipient) => recipient.email);
  let attachment: Uint8Array | null = null;
  let provider: EmailProvider | null = null;
  let emailProblem: string | null = null;
  if (emailing) {
    try {
      provider = getEmailProvider();
    } catch (error) {
      if (!(error instanceof EmailNotConfigured)) throw error;
      emailProblem = "Email isn't set up yet";
    }
    if (provider) {
      const { data: file } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(document.file_path);
      if (!file)
        return { status: "error", message: "We couldn't open that certificate. Please try again." };
      attachment = new Uint8Array(await file.arrayBuffer());
    }
  }

  const { data: service, error: serviceError } = await supabase
    .from("certificate_services")
    .insert({
      org_id: membership.orgId,
      property_id: propertyId,
      document_id: document.id,
      property_service_id: propertyServiceId,
      subject,
      message,
      sent_by: user.id,
    })
    .select("id")
    .single();
  if (serviceError) return { status: "error", message: "We couldn't send that. Please try again." };

  // Into each tenancy's portal.
  const tenancyIds = [...new Set(recipients.map((recipient) => recipient.tenancyId))];
  const { error: portalError } = await supabase.from("document_services").upsert(
    tenancyIds.map((tenancyId) => ({
      org_id: membership.orgId,
      document_id: document.id,
      tenancy_id: tenancyId,
      method: "portal" as const,
      served_by: user.id,
    })),
    { onConflict: "document_id,tenancy_id", ignoreDuplicates: true },
  );
  if (portalError)
    return { status: "error", message: "We couldn't add it to the portal. Please try again." };

  // One email each, recording every result.
  const rows = [];
  for (const recipient of recipients) {
    const base = {
      org_id: membership.orgId,
      certificate_service_id: service.id,
      tenant_id: recipient.tenantId,
      tenancy_id: recipient.tenancyId,
      name: recipient.name,
      email: recipient.email,
    };
    if (!recipient.email) {
      rows.push({ ...base, channel: "portal" as const, email_status: "no_email" as const });
      continue;
    }
    if (!provider || !attachment) {
      rows.push({
        ...base,
        channel: "email_and_portal" as const,
        email_status: "failed" as const,
        error: emailProblem ?? "Couldn't send the email",
      });
      continue;
    }
    try {
      const { id: messageId } = await provider.send({
        to: recipient.email,
        subject,
        ...serveEmail({
          firstName: recipient.firstName,
          message,
          organisation: membership.orgName,
        }),
        replyTo: user.email ?? undefined,
        attachments: [{ filename: document.file_name, content: attachment }],
      });
      rows.push({
        ...base,
        channel: "email_and_portal" as const,
        email_status: "sent" as const,
        provider_message_id: messageId,
      });
    } catch (error) {
      if (!(error instanceof EmailFailed)) throw error;
      rows.push({
        ...base,
        channel: "email_and_portal" as const,
        email_status: "failed" as const,
        error: error.message.slice(0, 200),
      });
    }
  }
  const { error: recordError } = await supabase.from("certificate_service_recipients").insert(rows);
  if (recordError) {
    return {
      status: "error",
      message: "It was sent, but we couldn't save the record. Contact support.",
    };
  }

  const emailed = rows.filter((row) => row.email_status === "sent").length;
  const failed = rows.filter((row) => row.email_status === "failed").length;
  const portalOnly = rows.filter((row) => row.email_status === "no_email").length;
  const parts = [
    emailed ? `${emailed} emailed` : null,
    portalOnly ? `${portalOnly} portal only` : null,
    failed ? `${failed} email${failed === 1 ? "" : "s"} failed (it's in their portal)` : null,
  ].filter(Boolean);
  return {
    status: failed ? "error" : "success",
    message: `Served to ${rows.length} ${rows.length === 1 ? "tenant" : "tenants"}: ${parts.join(", ")}.`,
  };
}
