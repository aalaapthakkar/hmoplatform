import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/validation/document";

/** Seconds a download link works for. Long enough to start the download, no longer. */
const LINK_LIFETIME = 60;

/**
 * Sends the user to a short-lived private link for a document. RLS on the
 * documents table and on Storage decides whether they may see it.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/properties/[propertyId]/documents/[documentId]/download">,
) {
  const { propertyId, documentId } = await params;
  const ids = z.object({ propertyId: z.uuid(), documentId: z.uuid() });
  if (!ids.safeParse({ propertyId, documentId }).success) return notFound();

  const membership = await requireMembership();
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("file_path, file_name")
    .eq("id", documentId)
    .eq("property_id", propertyId)
    .eq("org_id", membership.orgId)
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
