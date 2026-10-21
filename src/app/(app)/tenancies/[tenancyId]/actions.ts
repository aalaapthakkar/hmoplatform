"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { EsignError } from "@/lib/esign";
import {
  refreshAgreements,
  removeGuarantorRequirement,
  saveSignedCopies,
  sendAgreements,
} from "@/lib/esign/workflow";
import { createClient } from "@/lib/supabase/server";
import { optionalText } from "@/lib/validation/property";

const id = z.uuid();
const NOT_FOUND: ActionResult = { status: "error", message: "We couldn't find that tenancy." };

/** EsignError messages are written for people; anything else gets a general message. */
function failure(error: unknown): ActionResult {
  if (error instanceof EsignError) return { status: "error", message: error.message };
  return {
    status: "error",
    message: "Something went wrong talking to the e-signing service. Please try again.",
  };
}

export type GuarantorFormValues = { name: string; email: string; phone: string; address: string };

const guarantorSchema = z.object({
  name: z.string().trim().min(1, "Enter the guarantor's name").max(120),
  email: z.string().trim().pipe(z.email("Enter the guarantor's email address")),
  phone: optionalText(30, "Use 30 characters or fewer"),
  address: optionalText(300, "Use 300 characters or fewer"),
});

export async function addGuarantor(tenancyId: string, input: unknown): Promise<ActionResult> {
  const parsed = guarantorSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(tenancyId).success) {
    return {
      status: "error",
      message: parsed.error?.issues[0]?.message ?? "Check the guarantor's details.",
    };
  }
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_guarantor", {
    p_tenancy_id: tenancyId,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_address: parsed.data.address,
  });
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error)
    return { status: "error", message: "We couldn't add the guarantor. Please try again." };
  return { status: "success", message: `${parsed.data.name} added as guarantor.` };
}

const removeSchema = z.object({
  reason: z.string().trim().min(1, "Give a reason").max(500, "Use 500 characters or fewer"),
});

export async function removeGuarantor(guarantorId: string, input: unknown): Promise<ActionResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(guarantorId).success) {
    return { status: "error", message: parsed.error?.issues[0]?.message ?? "Give a reason." };
  }
  await requireMembership();
  try {
    await removeGuarantorRequirement(guarantorId, parsed.data.reason);
  } catch (error) {
    return failure(error);
  }
  return {
    status: "success",
    message:
      "Guarantor requirement removed. The tenancy agreement and its signatures are unchanged.",
  };
}

export async function sendForSignature(tenancyId: string): Promise<ActionResult> {
  if (!id.safeParse(tenancyId).success) return NOT_FOUND;
  await requireMembership();
  try {
    const sent = await sendAgreements(tenancyId);
    if (sent.length === 0) {
      return { status: "success", message: "Everything has already been sent." };
    }
    return {
      status: "success",
      message: `Sent for signature: ${sent.join(" and ").toLowerCase()}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function refreshSignatures(tenancyId: string): Promise<ActionResult> {
  if (!id.safeParse(tenancyId).success) return NOT_FOUND;
  await requireMembership();
  try {
    const { saved, waiting } = await refreshAgreements(tenancyId);
    return {
      status: "success",
      message:
        saved > 0
          ? `Status updated, and ${saved === 1 ? "the signed copy is" : "the signed copies are"} saved to documents.`
          : waiting
            ? "Signed. The provider is still preparing the final PDF: check again in a minute."
            : "Status updated.",
    };
  } catch (error) {
    return failure(error);
  }
}

/** Run quietly when a tenancy is opened: saves signed copies that webhooks marked complete. */
export async function syncSignedCopies(tenancyId: string): Promise<ActionResult> {
  if (!id.safeParse(tenancyId).success) return NOT_FOUND;
  await requireMembership();
  try {
    const { saved } = await saveSignedCopies(tenancyId);
    return { status: "success", message: saved > 0 ? "Signed copy saved to documents." : "" };
  } catch (error) {
    return failure(error);
  }
}
