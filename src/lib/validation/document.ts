import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

type DocumentType = Database["public"]["Enums"]["document_type"];

export const DOCUMENTS_BUCKET = "documents";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  gas_safety: "Gas safety certificate",
  eicr: "Electrical report (EICR)",
  epc: "Energy certificate (EPC)",
  hmo_licence: "HMO licence",
  fire_risk_assessment: "Fire risk assessment",
  tenancy_agreement: "Tenancy agreement",
  right_to_rent: "Right to rent check",
  deposit_certificate: "Deposit certificate",
  inventory: "Inventory",
  other: "Other",
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as [DocumentType, ...DocumentType[]];

/** Matches the bucket's limits in migration 0009. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FILE_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const ALLOWED_FILE_TYPES = new Set(Object.values(FILE_TYPES_BY_EXTENSION));
export const ACCEPTED_FILES = Object.keys(FILE_TYPES_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(",");

/**
 * The file's content type, or null if it isn't one we accept. Some phones
 * leave the type blank for HEIC photos, so the extension decides then.
 */
export function fileContentType(file: { name: string; type: string }): string | null {
  if (ALLOWED_FILE_TYPES.has(file.type)) return file.type;
  if (file.type && file.type !== "application/octet-stream") return null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_TYPES_BY_EXTENSION[extension] ?? null;
}

/** Why a file can't be uploaded, or null if it's fine. */
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return "That file is empty. Choose another one.";
  if (file.size > MAX_FILE_BYTES) return "That file is over 20 MB. Choose a smaller one.";
  if (!fileContentType(file)) return "Upload a PDF, a photo (JPG, PNG or HEIC) or a Word document.";
  return null;
}

/** A file name that's safe in a Storage path: letters, numbers, dots, dashes, underscores. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");
  const safeStem = clean(stem).slice(0, 80) || "document";
  const safeExtension = clean(extension).slice(0, 10);
  return safeExtension ? `${safeStem}.${safeExtension}` : safeStem;
}

/** Where a property's documents live: <org>/properties/<property>/. */
export function propertyFolder(orgId: string, propertyId: string) {
  return `${orgId}/properties/${propertyId}/`;
}

/** A new, unique Storage path for a file, inside the property's folder. */
export function documentPath(orgId: string, propertyId: string, fileName: string, id: string) {
  return `${propertyFolder(orgId, propertyId)}${id}-${safeFileName(fileName)}`;
}

const expiryDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isRealDate(value), "Enter a real date, like 31/12/2026")
  .transform((value) => value || null);

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** The upload form, checked before the file is sent. */
export const documentFormSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES, "Choose what kind of document this is"),
  expiryDate,
});

export type DocumentFormValues = { documentType: string; expiryDate: string };

/** What the browser sends after uploading, checked again on the server. */
export const recordDocumentSchema = documentFormSchema.extend({
  path: z.string().min(1).max(400),
  fileName: z.string().trim().min(1).max(200),
});
