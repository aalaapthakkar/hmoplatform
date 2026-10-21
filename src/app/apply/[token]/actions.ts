"use server";

import { z } from "zod";
import { looksLikePortalToken } from "@/lib/onboarding/portal-token";
import { createClient } from "@/lib/supabase/server";
import { applicationDraftSchema, applicationSchema } from "@/lib/validation/application";

export type PortalResult = {
  status: "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const EXPIRED: PortalResult = {
  status: "error",
  message: "This link isn't working any more. Ask whoever sent it for a new one.",
};

/** Saves the application as a draft, or checks it fully and submits it. */
export async function saveApplication(
  token: string,
  input: unknown,
  submit: boolean,
): Promise<PortalResult> {
  if (!looksLikePortalToken(token)) return EXPIRED;
  const parsed = (submit ? applicationSchema : applicationDraftSchema).safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Some answers need another look.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_save_application", {
    p_token: token,
    p_application: parsed.data,
    p_submit: submit,
  });
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };

  return {
    status: "success",
    message: submit
      ? "Thanks, we've got your application."
      : "Saved. You can come back to it later.",
  };
}

const uploadSchema = z.object({
  path: z.string().min(1).max(400),
  fileName: z.string().trim().min(1).max(200),
  documentType: z.enum(["identity", "right_to_rent", "proof_of_income", "other"]),
});

/** Records a file the applicant's browser has just uploaded to their folder. */
export async function recordUpload(token: string, input: unknown): Promise<PortalResult> {
  if (!looksLikePortalToken(token)) return EXPIRED;
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Choose what kind of document this is." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_record_document", {
    p_token: token,
    p_path: parsed.data.path,
    p_file_name: parsed.data.fileName,
    p_document_type: parsed.data.documentType,
  });
  if (error?.code === "P0001") return { status: "error", message: error.message };
  if (error) return { status: "error", message: "We couldn't save that file. Please try again." };

  return { status: "success", message: `${parsed.data.fileName} uploaded.` };
}
