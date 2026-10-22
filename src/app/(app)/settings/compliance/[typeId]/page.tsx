import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ServiceTypeForm } from "@/components/compliance/service-type-form";
import { requireMembership } from "@/lib/auth/session";
import type { ServiceField } from "@/lib/compliance/fields";
import { serviceTypeFormValues } from "@/lib/compliance/service-type";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compliance type" };

type Props = PageProps<"/settings/compliance/[typeId]">;

export default function ComplianceTypePage({ params }: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/settings/compliance"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Compliance types
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <TypeEditor params={params} />
      </Suspense>
    </div>
  );
}

async function TypeEditor({ params }: Pick<Props, "params">) {
  const { typeId } = await params;
  const membership = await requireMembership();
  const canEdit = membership.role === "admin";

  if (typeId === "new") {
    if (!canEdit) notFound();
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Add a compliance type</h1>
        <ServiceTypeForm
          typeId={null}
          initial={serviceTypeFormValues()}
          initialFields={[]}
          archived={false}
          canEdit
        />
      </>
    );
  }

  if (!z.uuid().safeParse(typeId).success) notFound();
  const supabase = await createClient();
  const { data: type } = await supabase
    .from("service_types")
    .select(
      "id, name, category, validity_months, alert_window_days, requires_document, document_type, auto_create_job, expiry_label, fields, status",
    )
    .eq("id", typeId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!type) notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{type.name}</h1>
      <ServiceTypeForm
        key={type.id}
        typeId={type.id}
        initial={serviceTypeFormValues(type)}
        initialFields={type.fields as ServiceField[]}
        archived={type.status === "archived"}
        canEdit={canEdit}
      />
    </>
  );
}
