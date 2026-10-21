"use server";

import { z } from "zod";
import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { templateSchema } from "@/lib/validation/template";

/** Saves a template. RLS lets only admins write, so staff get "not allowed". */
export async function saveTemplate(templateId: string, input: unknown): Promise<ActionResult> {
  if (!z.uuid().safeParse(templateId).success) {
    return { status: "error", message: "We couldn't find that template." };
  }
  const membership = await requireMembership();
  if (membership.role !== "admin") {
    return { status: "error", message: "Only admins can change document templates." };
  }

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("document_templates")
    .select("kind")
    .eq("id", templateId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!template) return { status: "error", message: "We couldn't find that template." };

  const parsed = templateSchema(template.kind).safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the template." };
  }

  const { data, error } = await supabase
    .from("document_templates")
    .update({ name: parsed.data.name, body: parsed.data.body, is_draft: parsed.data.isDraft })
    .eq("id", templateId)
    .select("id");
  if (error || data.length === 0) {
    return { status: "error", message: "We couldn't save the template. Please try again." };
  }
  return { status: "success", message: "Template saved." };
}
