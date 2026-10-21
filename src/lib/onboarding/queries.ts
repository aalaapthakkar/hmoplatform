import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type OnboardingStepRow = Pick<
  Tables["onboarding_steps"]["Row"],
  | "id"
  | "position"
  | "kind"
  | "title"
  | "status"
  | "owner_user_id"
  | "owner_is_applicant"
  | "due_date"
  | "notes"
  | "completed_at"
>;

export type OnboardingDetailRow = Pick<
  Tables["onboardings"]["Row"],
  | "id"
  | "org_id"
  | "status"
  | "created_at"
  | "completed_at"
  | "application_submitted_at"
  | "portal_expires_at"
  | "portal_revoked_at"
  | "upload_key"
> & {
  application: Json;
  rooms: {
    id: string;
    name: string;
    properties: { id: string; address_line_1: string; town: string; postcode: string } | null;
  } | null;
  tenancies: {
    id: string;
    start_date: string;
    status: Tables["tenancies"]["Row"]["status"];
    tenancy_tenants: {
      status: Tables["tenancy_tenants"]["Row"]["status"];
      tenants: {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      } | null;
    }[];
  } | null;
  onboarding_steps: OnboardingStepRow[];
};

const DETAIL_COLUMNS = `
  id, org_id, status, created_at, completed_at, application, application_submitted_at,
  portal_expires_at, portal_revoked_at, upload_key,
  rooms (id, name, properties (id, address_line_1, town, postcode)),
  tenancies (id, start_date, status,
    tenancy_tenants (status, tenants (id, first_name, last_name, email, phone))),
  onboarding_steps (id, position, kind, title, status, owner_user_id, owner_is_applicant,
    due_date, notes, completed_at)
`;

/** One onboarding in the user's organisation, with everything its page shows, or a 404. */
export const getOnboarding = cache(async (onboardingId: string) => {
  if (!z.uuid().safeParse(onboardingId).success) notFound();
  const membership = await requireMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("onboardings")
    .select(DETAIL_COLUMNS)
    .eq("id", onboardingId)
    .eq("org_id", membership.orgId)
    .maybeSingle()
    .overrideTypes<OnboardingDetailRow, { merge: false }>();
  if (error) throw new Error("Could not load the onboarding", { cause: error.code });
  if (!data) notFound();

  const tenant =
    data.tenancies?.tenancy_tenants.find((link) => link.status === "active")?.tenants ?? null;
  const folder = `${data.org_id}/applicants/${data.upload_key}/`;

  const [documents, checks, reminders, people] = await Promise.all([
    tenant
      ? supabase
          .from("documents")
          .select("id, document_type, file_name, created_at")
          .eq("tenant_id", tenant.id)
          .eq("status", "active")
          .like("file_path", `${folder}%`)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    tenant
      ? supabase
          .from("right_to_rent_checks")
          .select("id, check_date, method, permission, expiry_date, notes")
          .eq("tenant_id", tenant.id)
          .eq("status", "active")
          .order("check_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    tenant
      ? supabase
          .from("reminders")
          .select("id, title, due_date, status")
          .eq("tenant_id", tenant.id)
          .eq("status", "open")
          .order("due_date")
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("org_people", { p_org_id: membership.orgId }),
  ]);
  for (const result of [documents, checks, reminders, people]) {
    if (result.error)
      throw new Error("Could not load the onboarding", { cause: result.error.code });
  }

  return {
    onboarding: data,
    tenant,
    steps: [...data.onboarding_steps].sort((a, b) => a.position - b.position),
    documents: documents.data ?? [],
    checks: checks.data ?? [],
    reminders: reminders.data ?? [],
    people: people.data ?? [],
  };
});

export type OnboardingDetail = Awaited<ReturnType<typeof getOnboarding>>;
