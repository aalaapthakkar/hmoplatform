import { Download } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { buttonVariants } from "@/components/ui/button";
import { formatUkDate } from "@/lib/format";
import { requireTenant } from "@/lib/portal/queries";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/document";

export const metadata: Metadata = { title: "Documents" };

type Tables = Database["public"]["Tables"];
type ServedRow = Pick<Tables["document_services"]["Row"], "id" | "served_at"> & {
  documents: Pick<Tables["documents"]["Row"], "id" | "file_name" | "document_type"> | null;
};

export default function PortalDocumentsPage() {
  return (
    <>
      <PortalHeading title="Documents">
        Documents your letting team has given you, such as your signed tenancy agreement.
      </PortalHeading>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <Documents />
      </Suspense>
    </>
  );
}

async function Documents() {
  const { home } = await requireTenant();
  if (!home) return <NoTenancyYet />;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_services")
    .select("id, served_at, documents (id, file_name, document_type)")
    .eq("tenancy_id", home.tenancyId)
    .order("served_at", { ascending: false })
    .overrideTypes<ServedRow[], { merge: false }>();
  if (error) throw new Error("Could not load documents", { cause: error.code });
  const served = data.filter((row) => row.documents);

  if (served.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
        No documents yet. Your signed tenancy agreement will appear here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-background" aria-label="Documents">
      {served.map(({ id, served_at, documents: document }) => (
        <li key={id} className="flex items-center justify-between gap-3 p-3">
          <span className="flex min-w-0 flex-col text-sm">
            <span className="font-medium">{DOCUMENT_TYPE_LABELS[document!.document_type]}</span>
            <span className="truncate text-muted-foreground">{document!.file_name}</span>
            <span className="text-xs text-muted-foreground">Given {formatUkDate(served_at)}</span>
          </span>
          <a
            href={`/portal/documents/${document!.id}/download`}
            className={buttonVariants({ variant: "outline", size: "icon-lg" })}
            aria-label={`Download ${document!.file_name}`}
          >
            <Download aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
