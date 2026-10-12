"use server";

import { redirect } from "next/navigation";
import { type FormState, parseFormData } from "@/lib/forms";
import { HOME_ROUTE } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { organisationSchema } from "@/lib/validation/organisation";

export async function createOrganisation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(organisationSchema, formData, ["name"]);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organisation", { org_name: parsed.data.name });

  if (error) {
    return {
      status: "error",
      message: "We couldn't set up your organisation. Please try again.",
      values: { name: parsed.data.name },
    };
  }

  redirect(HOME_ROUTE);
}
