import "server-only";

import { randomUUID } from "node:crypto";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { type AgreementData, getAgreementData } from "@/lib/documents/agreement-data";
import type { TemplateKind } from "@/lib/documents/merge";
import { renderAgreementPdf } from "@/lib/documents/pdf";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET, safeFileName } from "@/lib/validation/document";
import {
  applyEsignEvent,
  EsignError,
  EsignNotReady,
  type EsignProvider,
  type EsignSigner,
  getEsignProvider,
  snapshotKey,
} from "./index";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Saves a PDF to the org's private documents, linked to the tenancy, under the user's session. */
async function storePdf(
  supabase: Supabase,
  data: Pick<AgreementData, "orgId" | "tenancyId">,
  fileName: string,
  bytes: Uint8Array,
  documentType: "tenancy_agreement" | "other",
  userId: string,
) {
  const path = `${data.orgId}/tenancies/${data.tenancyId}/${randomUUID()}-${safeFileName(fileName)}`;
  const upload = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw new EsignError("Couldn't save the PDF.");
  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      org_id: data.orgId,
      tenancy_id: data.tenancyId,
      document_type: documentType,
      file_path: path,
      file_name: fileName,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new EsignError("Couldn't record the PDF.");
  return document.id;
}

const KIND_NAMES: Record<TemplateKind, string> = {
  tenancy_agreement: "Tenancy agreement",
  guarantor_agreement: "Guarantor agreement",
};

/**
 * Sends whichever agreements aren't already out or signed: the tenancy
 * agreement, and the guarantor agreement if there's a guarantor. Each is a
 * separate request so either can be cancelled alone.
 */
export async function sendAgreements(tenancyId: string): Promise<string[]> {
  const provider = getEsignProvider();
  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const supabase = await createClient();

  const [{ data: profile }, { data: existing }] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", user.id).single(),
    supabase
      .from("signature_requests")
      .select("kind, status, guarantor_id")
      .eq("tenancy_id", tenancyId)
      .in("status", ["sent", "partly_signed", "completed"]),
  ]);
  const countersigner = {
    name: profile?.full_name || profile?.email || "Authorised signatory",
    email: (profile?.email ?? user.email ?? "").toLowerCase(),
  };
  if (!countersigner.email)
    throw new EsignError("Your account needs an email address to countersign.");

  const sent: string[] = [];
  for (const kind of ["tenancy_agreement", "guarantor_agreement"] as const) {
    const data = await getAgreementData(tenancyId, kind);
    if (!data) throw new EsignError("We couldn't find that tenancy.");
    if (kind === "guarantor_agreement" && !data.guarantor) continue;
    const already = existing?.some(
      (request) =>
        request.kind === kind &&
        (kind === "tenancy_agreement" || request.guarantor_id === data.guarantor?.id),
    );
    if (already) continue;
    if (!data.template)
      throw new EsignError(`There's no ${KIND_NAMES[kind].toLowerCase()} template.`);

    const first =
      kind === "tenancy_agreement"
        ? { role: "tenant" as const, name: data.tenant.name, email: data.tenant.email }
        : { role: "guarantor" as const, name: data.guarantor!.name, email: data.guarantor!.email };
    if (!first.email) {
      throw new EsignError(`Add an email address for ${first.name} before sending.`);
    }
    const signers: EsignSigner[] = [
      { ...first, email: first.email.toLowerCase(), order: 1 },
      { role: "organisation", ...countersigner, order: 2 },
    ];

    const pdf = await renderAgreementPdf({
      title: data.title,
      body: data.template.body,
      values: data.values,
      isDraft: data.template.isDraft,
    });
    const documentId = await storePdf(
      supabase,
      data,
      `${data.title}.pdf`,
      pdf,
      kind === "tenancy_agreement" ? "tenancy_agreement" : "other",
      user.id,
    );

    const { providerRequestId } = await provider.send({
      title: data.title,
      subject: `Please sign: ${KIND_NAMES[kind].toLowerCase()} for ${data.values.room}`,
      message: `${membership.orgName} has sent you a ${KIND_NAMES[kind].toLowerCase()} to sign.`,
      fileName: safeFileName(`${data.title}.pdf`),
      pdf,
      signers,
      metadata: { tenancy_id: tenancyId, kind },
    });

    const { error } = await supabase.rpc("record_signature_request", {
      p_tenancy_id: tenancyId,
      p_kind: kind,
      p_template_id: data.template.id,
      p_guarantor_id: kind === "guarantor_agreement" ? data.guarantor!.id : null,
      p_provider: provider.name,
      p_provider_request_id: providerRequestId,
      p_unsigned_document_id: documentId,
      p_signers: signers,
    });
    if (error) {
      // Don't leave a request out for signature that the app doesn't know about.
      await provider.cancel(providerRequestId).catch(() => undefined);
      throw new EsignError("We couldn't record the signature request, so we cancelled it.");
    }
    sent.push(KIND_NAMES[kind]);
  }
  return sent;
}

/**
 * Checks each open request with the provider (useful where webhooks can't
 * reach the app), then saves any completed request's signed PDF.
 */
export async function refreshAgreements(
  tenancyId: string,
): Promise<{ saved: number; waiting: boolean }> {
  const provider = getEsignProvider();
  const supabase = await createClient();
  const { data: open } = await supabase
    .from("signature_requests")
    .select("provider_request_id")
    .eq("tenancy_id", tenancyId)
    .eq("provider", provider.name)
    .in("status", ["sent", "partly_signed"]);

  for (const request of open ?? []) {
    const status = await provider.getStatus(request.provider_request_id);
    await applyEsignEvent(provider.name, {
      providerRequestId: request.provider_request_id,
      eventKey: snapshotKey(provider.name, request.provider_request_id, status),
      eventType: "status_refresh",
      eventTime: new Date().toISOString(),
      status,
    });
  }
  return saveSignedCopies(tenancyId, provider);
}

/** Saves the signed PDF for completed requests that don't have one yet. */
export async function saveSignedCopies(
  tenancyId: string,
  provider: EsignProvider = getEsignProvider(),
): Promise<{ saved: number; waiting: boolean }> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: done } = await supabase
    .from("signature_requests")
    .select("id, org_id, kind, provider_request_id")
    .eq("tenancy_id", tenancyId)
    .eq("provider", provider.name)
    .eq("status", "completed")
    .is("signed_document_id", null);

  let saved = 0;
  let waiting = false;
  for (const request of done ?? []) {
    let bytes: Uint8Array;
    try {
      bytes = await provider.downloadSigned(request.provider_request_id);
    } catch (error) {
      if (error instanceof EsignNotReady) {
        waiting = true;
        continue;
      }
      throw error;
    }
    const documentId = await storePdf(
      supabase,
      { orgId: request.org_id, tenancyId },
      `${KIND_NAMES[request.kind]} (signed).pdf`,
      bytes,
      request.kind === "tenancy_agreement" ? "tenancy_agreement" : "other",
      user.id,
    );
    const { error } = await supabase.rpc("attach_signed_document", {
      p_request_id: request.id,
      p_document_id: documentId,
    });
    if (!error) saved += 1;
  }
  return { saved, waiting };
}

/**
 * Removes the guarantor requirement before the guarantor signs: cancels the
 * guarantor agreement with the provider, then records the removal. The
 * tenancy agreement and its signatures are not touched.
 */
export async function removeGuarantorRequirement(guarantorId: string, reason: string) {
  const supabase = await createClient();
  const { data: signed } = await supabase
    .from("signature_request_signers")
    .select("id, signature_requests!inner(guarantor_id, status)")
    .eq("role", "guarantor")
    .eq("status", "signed")
    .eq("signature_requests.guarantor_id", guarantorId)
    .neq("signature_requests.status", "cancelled");
  if (signed && signed.length > 0) {
    throw new EsignError(
      "The guarantor has already signed, so the guarantee can't be removed here.",
    );
  }

  const { data: open } = await supabase
    .from("signature_requests")
    .select("provider, provider_request_id")
    .eq("guarantor_id", guarantorId)
    .in("status", ["sent", "partly_signed"]);
  if (open && open.length > 0) {
    const provider = getEsignProvider();
    for (const request of open) {
      if (request.provider === provider.name) await provider.cancel(request.provider_request_id);
    }
  }

  const { error } = await supabase.rpc("remove_guarantor", {
    p_guarantor_id: guarantorId,
    p_reason: reason,
  });
  if (error?.code === "P0001") throw new EsignError(error.message);
  if (error) throw new EsignError("We couldn't remove the guarantor. Please try again.");
}
