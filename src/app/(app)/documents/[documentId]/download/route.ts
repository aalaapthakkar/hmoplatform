import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/validation/document";

/** Seconds a download link works for. Long enough to start the download, no longer. */
const LINK_LIFETIME = 60;

/**
 * Any document in the user's organisation, through a short-lived private
 * link. RLS on documents and on Storage decides what they may see.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/documents/[documentId]/download">,
) {
  const { documentId } = await params;
  if (!z.uuid().safeParse(documentId).success) return notFound();

  const membership = await requireMembership();
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("file_path, file_name")
    .eq("id", documentId)
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
