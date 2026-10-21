import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/portal/queries";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/validation/document";

/** Seconds a download link works for. Long enough to start the download, no longer. */
const LINK_LIFETIME = 60;

/**
 * A document served to the tenant, through a short-lived private link. RLS
 * on documents and Storage only lets tenants see documents served to them.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/portal/documents/[documentId]/download">,
) {
  const { documentId } = await params;
  if (!z.uuid().safeParse(documentId).success) return notFound();

  await requireTenant();
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("file_path, file_name")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return notFound();

  const { data } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(document.file_path, LINK_LIFETIME, { download: document.file_name });
  if (!data) return notFound();

  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}

function notFound() {
  return new NextResponse("That document isn't available.", { status: 404 });
}
