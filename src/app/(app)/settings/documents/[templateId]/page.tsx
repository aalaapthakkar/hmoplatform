import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { TemplateEditor } from "@/components/documents/template-editor";
import { requireMembership } from "@/lib/auth/session";
import { TEMPLATE_KIND_LABELS } from "@/lib/documents/merge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit template" };

export default function TemplatePage({ params }: PageProps<"/settings/documents/[templateId]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/settings/documents"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Document templates
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Template params={params} />
      </Suspense>
    </div>
  );
}

async function Template({ params }: Pick<PageProps<"/settings/documents/[templateId]">, "params">) {
  const { templateId } = await params;
  if (!z.uuid().safeParse(templateId).success) notFound();
  const membership = await requireMembership();
  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("document_templates")
    .select("id, kind, name, body, is_draft")
    .eq("id", templateId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (error) throw new Error("Could not load the template", { cause: error.code });
  if (!template) notFound();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <p className="text-muted-foreground">{TEMPLATE_KIND_LABELS[template.kind]}</p>
      </div>
      <TemplateEditor
        templateId={template.id}
        kind={template.kind}
        canEdit={membership.role === "admin"}
        initial={{
          name: template.name,
          body: template.body,
          isDraft: template.is_draft ? "yes" : "no",
        }}
      />
    </>
  );
}
