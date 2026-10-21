"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireTenant } from "@/lib/portal/queries";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_REPAIR_PHOTOS,
  messageSchema,
  repairFolder,
  repairSchema,
} from "@/lib/validation/maintenance";

const NO_TENANCY: ActionResult = {
  status: "error",
  message: "We couldn't find your tenancy. Contact your letting team.",
};

/** The organisation that runs the tenant's tenancy. RLS only shows their own. */
async function tenancyOrg(tenancyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenancies")
    .select("org_id")
    .eq("id", tenancyId)
    .maybeSingle();
  return data?.org_id ?? null;
}

export type ReportRepairResult = ActionResult & { requestId?: string; folder?: string };

/** Reports a repair on the tenant's own room and house. Photos are added after. */
export async function reportRepair(input: unknown): Promise<ReportRepairResult> {
  const parsed = repairSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const { userId, home } = await requireTenant();
  if (!home) return NO_TENANCY;
  const orgId = await tenancyOrg(home.tenancyId);
  if (!orgId) return NO_TENANCY;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      org_id: orgId,
      property_id: home.property.id,
      room_id: home.roomId,
      tenancy_id: home.tenancyId,
      reported_by: userId,
      title: parsed.data.title,
      location: parsed.data.location,
      description: parsed.data.description,
      urgency: parsed.data.urgency,
    })
    .select("id")
    .single();
  if (error) return { status: "error", message: "We couldn't send that. Please try again." };
  return {
    status: "success",
    message: "Repair reported. We'll be in touch.",
    requestId: data.id,
    folder: repairFolder(orgId, data.id),
  };
}

const photosSchema = z
  .array(z.object({ path: z.string().min(1).max(500), fileName: z.string().min(1).max(200) }))
  .min(1)
  .max(MAX_REPAIR_PHOTOS);

/** Records photos the tenant has uploaded to the repair's folder. */
export async function addRepairPhotos(requestId: string, photos: unknown): Promise<ActionResult> {
  const parsed = photosSchema.safeParse(photos);
  if (!z.uuid().safeParse(requestId).success || !parsed.success) {
    return { status: "error", message: "We couldn't add those photos." };
  }
  const { userId } = await requireTenant();
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("org_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { status: "error", message: "We couldn't add those photos." };

  const folder = repairFolder(request.org_id, requestId);
  if (parsed.data.some((photo) => !photo.path.startsWith(folder))) {
    return { status: "error", message: "We couldn't add those photos." };
  }
  const { error } = await supabase.from("maintenance_photos").insert(
    parsed.data.map((photo) => ({
      org_id: request.org_id,
      request_id: requestId,
      file_path: photo.path,
      file_name: photo.fileName,
      uploaded_by: userId,
    })),
  );
  if (error) return { status: "error", message: "We couldn't add those photos." };
  return { status: "success", message: "Photos added." };
}

/** Sends a message to the letting team about the tenant's tenancy. */
export async function sendTenantMessage(input: unknown): Promise<ActionResult> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the message." };
  }
  const { home } = await requireTenant();
  if (!home) return NO_TENANCY;
  const orgId = await tenancyOrg(home.tenancyId);
  if (!orgId) return NO_TENANCY;

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    org_id: orgId,
    tenancy_id: home.tenancyId,
    sender: "tenant",
    body: parsed.data.body,
  });
  if (error) return { status: "error", message: "We couldn't send that. Please try again." };
  return { status: "success", message: "Message sent." };
}
