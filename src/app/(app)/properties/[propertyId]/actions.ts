"use server";

import { z } from "zod";
import { getCurrentUser, requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { detailsSchema } from "@/lib/validation/details";
import { DOCUMENTS_BUCKET, propertyFolder, recordDocumentSchema } from "@/lib/validation/document";
import { ownerArgs, ownershipSchema } from "@/lib/validation/property";
import { roomSchema, toRoomRow } from "@/lib/validation/room";

export type ActionResult = {
  status: "success" | "error";
  message: string;
  /** The id of a record the action created, when there is one. */
  id?: string;
};

const CHECK_AGAIN: ActionResult = {
  status: "error",
  message: "Some details need another look. Check the highlighted fields and try again.",
};
const NOT_FOUND: ActionResult = {
  status: "error",
  message: "We couldn't find that room. Refresh the page and try again.",
};
const PROPERTY_NOT_FOUND: ActionResult = {
  status: "error",
  message: "We couldn't find that property. Refresh the page and try again.",
};
const DOCUMENT_NOT_FOUND: ActionResult = {
  status: "error",
  message: "We couldn't find that document. Refresh the page and try again.",
};
const TRY_AGAIN: ActionResult = {
  status: "error",
  message: "We couldn't save that. Please try again.",
};

const id = z.uuid();

/** Adds a room to a property in the user's organisation. */
export async function addRoom(propertyId: string, input: unknown): Promise<ActionResult> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(propertyId).success) return CHECK_AGAIN;

  const membership = await requireMembership();
  const supabase = await createClient();
  // The composite foreign key and RLS make sure the property is in this org.
  const { error } = await supabase.from("rooms").insert({
    ...toRoomRow(parsed.data),
    org_id: membership.orgId,
    property_id: propertyId,
  });
  if (error) return error.code === "23503" ? NOT_FOUND : TRY_AGAIN;

  return { status: "success", message: `${parsed.data.name} added.` };
}

export async function updateRoom(
  propertyId: string,
  roomId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(propertyId).success || !id.safeParse(roomId).success) {
    return CHECK_AGAIN;
  }

  await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .update(toRoomRow(parsed.data))
    .eq("id", roomId)
    .eq("property_id", propertyId)
    .neq("status", "archived")
    .select("id");
  if (error) return TRY_AGAIN;
  if (data.length === 0) return NOT_FOUND;

  return { status: "success", message: `${parsed.data.name} saved.` };
}

/** Archives a room. The database refuses while it has a current tenancy. */
export async function archiveRoom(propertyId: string, roomId: string): Promise<ActionResult> {
  if (!id.safeParse(propertyId).success || !id.safeParse(roomId).success) return NOT_FOUND;

  await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .update({ status: "archived" })
    .eq("id", roomId)
    .eq("property_id", propertyId)
    .select("name");

  if (error?.code === "23514" && error.message.includes("current tenancy")) {
    return {
      status: "error",
      message: "This room has a current tenancy. End the tenancy before archiving the room.",
    };
  }
  if (error) return TRY_AGAIN;
  if (data.length === 0) return NOT_FOUND;

  return { status: "success", message: `${data[0]!.name} archived.` };
}

/** Changes how the property is held, its owner and head rent, in one transaction. */
export async function setOwnership(propertyId: string, input: unknown): Promise<ActionResult> {
  const parsed = ownershipSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(propertyId).success) return CHECK_AGAIN;

  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_property_ownership", {
    p_property_id: propertyId,
    ...ownerArgs(parsed.data),
  });
  if (error?.code === "P0002") return PROPERTY_NOT_FOUND;
  if (error) return TRY_AGAIN;

  return { status: "success", message: "Ownership saved." };
}

/** Saves the description, amenities, house rules and bills included flag. */
export async function updateDetails(propertyId: string, input: unknown): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(propertyId).success) return CHECK_AGAIN;

  const membership = await requireMembership();
  const supabase = await createClient();
  const { description, amenities, houseRules, billsIncluded } = parsed.data;
  const { data, error } = await supabase
    .from("properties")
    .update({
      description,
      amenities,
      house_rules: houseRules,
      bills_included: billsIncluded,
    })
    .eq("id", propertyId)
    .eq("org_id", membership.orgId)
    .select("id");
  if (error) return TRY_AGAIN;
  if (data.length === 0) return PROPERTY_NOT_FOUND;

  return { status: "success", message: "Details saved." };
}

/**
 * Records a document the browser has just uploaded to Storage. The path must
 * be inside this property's folder in the user's organisation, and the file
 * must really be there.
 */
export async function recordDocument(propertyId: string, input: unknown): Promise<ActionResult> {
  const parsed = recordDocumentSchema.safeParse(input);
  if (!parsed.success || !id.safeParse(propertyId).success) return CHECK_AGAIN;

  const [membership, user] = await Promise.all([requireMembership(), getCurrentUser()]);
  const { path, fileName, documentType, expiryDate } = parsed.data;
  const folder = propertyFolder(membership.orgId, propertyId);
  const rest = path.slice(folder.length);
  if (!path.startsWith(folder) || !rest || rest.includes("/") || rest.includes("..")) {
    return CHECK_AGAIN;
  }

  const supabase = await createClient();
  const { data: uploaded } = await supabase.storage.from(DOCUMENTS_BUCKET).exists(path);
  if (!uploaded) {
    return {
      status: "error",
      message: "We couldn't find the uploaded file. Please try uploading it again.",
    };
  }

  const { error } = await supabase.from("documents").insert({
    org_id: membership.orgId,
    property_id: propertyId,
    document_type: documentType,
    file_path: path,
    file_name: fileName,
    expiry_date: expiryDate,
    uploaded_by: user.id,
  });
  if (error) return error.code === "23503" ? PROPERTY_NOT_FOUND : TRY_AGAIN;

  return { status: "success", message: `${fileName} uploaded.` };
}

/** Hides a document from the list. The file and its record are kept. */
export async function archiveDocument(
  propertyId: string,
  documentId: string,
): Promise<ActionResult> {
  if (!id.safeParse(propertyId).success || !id.safeParse(documentId).success) {
    return DOCUMENT_NOT_FOUND;
  }

  await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ status: "archived" })
    .eq("id", documentId)
    .eq("property_id", propertyId)
    .select("file_name");
  if (error) return TRY_AGAIN;
  if (data.length === 0) return DOCUMENT_NOT_FOUND;

  return { status: "success", message: `${data[0]!.file_name} archived.` };
}
