"use server";

import { z } from "zod";
import { type ActionResult, recordDocument } from "@/app/(app)/properties/[propertyId]/actions";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { parseDetails, type ServiceField } from "@/lib/compliance/fields";
import { expiryFrom } from "@/lib/compliance/status";
import { todayInLondon } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { optionalDateField } from "@/lib/validation/dates";

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
    const recorded = await recordDocument(propertyId, {
      path: upload.path,
      fileName: upload.fileName,
      documentType: type.document_type,
      expiryDate: expiresOn,
    });
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
