"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { serviceTypeSchema } from "@/lib/compliance/service-type";
import { createClient } from "@/lib/supabase/server";

const NOT_ADMIN: ActionResult = {
  status: "error",
  message: "Only admins can change compliance types.",
};

/** Adds a type (typeId null) or saves changes to one. RLS also lets only admins write. */
export async function saveServiceType(
  typeId: string | null,
  input: unknown,
): Promise<ActionResult> {
  if (typeId !== null && !z.uuid().safeParse(typeId).success) {
    return { status: "error", message: "We couldn't find that type." };
  }
  const membership = await requireMembership();
  if (membership.role !== "admin") return NOT_ADMIN;
  const parsed = serviceTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const values = {
    name: parsed.data.name,
    category: parsed.data.category,
    validity_months: parsed.data.validityMonths,
    alert_window_days: parsed.data.alertWindowDays,
    requires_document: parsed.data.requiresDocument,
    document_type: parsed.data.documentType,
    auto_create_job: parsed.data.autoCreateJob,
    expiry_label: parsed.data.expiryLabel,
    fields: parsed.data.fields,
  };

  const supabase = await createClient();
  if (typeId === null) {
    const { data, error } = await supabase
      .from("service_types")
      .insert({ org_id: membership.orgId, ...values })
      .select("id")
      .single();
    if (error?.code === "P0001") return { status: "error", message: error.message };
    if (error) return { status: "error", message: "We couldn't add that type. Please try again." };
    return { status: "success", message: `${values.name} added.`, id: data.id };
  }

  const { data, error } = await supabase
    .from("service_types")
    .update(values)
    .eq("id", typeId)
    .eq("org_id", membership.orgId)
    .select("id");
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error || data.length === 0) {
    return { status: "error", message: "We couldn't save that. Please try again." };
  }
  return { status: "success", message: `${values.name} saved.`, id: typeId };
}

/** Archives a type (it stops showing everywhere) or brings it back. Nothing is deleted. */
export async function setServiceTypeArchived(
  typeId: string,
  archived: boolean,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(typeId).success) {
    return { status: "error", message: "We couldn't find that type." };
  }
  const membership = await requireMembership();
  if (membership.role !== "admin") return NOT_ADMIN;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_types")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", typeId)
    .eq("org_id", membership.orgId)
    .select("name");
  if (error || data.length === 0) {
    return { status: "error", message: "We couldn't change that. Please try again." };
  }
  return {
    status: "success",
    message: archived ? `${data[0]!.name} archived.` : `${data[0]!.name} is back.`,
  };
}
