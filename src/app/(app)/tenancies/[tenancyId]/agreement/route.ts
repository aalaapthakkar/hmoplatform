import { NextResponse } from "next/server";
import { getAgreementData } from "@/lib/documents/agreement-data";
import { safeFileName } from "@/lib/validation/document";
import { renderAgreementPdf } from "@/lib/documents/pdf";

/**
 * A preview PDF of a tenancy's agreement: ?kind=tenancy_agreement (the
 * default) or ?kind=guarantor_agreement. Made fresh each time, not stored.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/tenancies/[tenancyId]/agreement">,
) {
  const { tenancyId } = await params;
  const kind =
    new URL(request.url).searchParams.get("kind") === "guarantor_agreement"
      ? "guarantor_agreement"
      : "tenancy_agreement";

  const data = await getAgreementData(tenancyId, kind);
  if (!data) return new NextResponse("That tenancy isn't available.", { status: 404 });
  if (!data.template) {
    return new NextResponse("There's no template for this document yet.", { status: 404 });
  }
  if (kind === "guarantor_agreement" && !data.guarantor) {
    return new NextResponse("This tenancy has no guarantor.", { status: 404 });
  }

  const pdf = await renderAgreementPdf({
    title: data.title,
    body: data.template.body,
    values: data.values,
    isDraft: data.template.isDraft,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFileName(`${data.title}.pdf`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
