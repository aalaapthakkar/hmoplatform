import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { fieldsSchema, type ServiceField } from "./fields";

type Row = Database["public"]["Tables"]["service_types"]["Row"];

/** What the service type form edits. Booleans and numbers are strings until checked. */
export type ServiceTypeFormValues = {
  name: string;
  category: string;
  validityMonths: string;
  alertWindowDays: string;
  requiresDocument: string;
  documentType: string;
  autoCreateJob: string;
  expiryLabel: string;
};

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `Enter the ${label} as a whole number`)
    .transform(Number)
    .refine((value) => value >= min && value <= max, `Use ${min} to ${max}`);

export const serviceTypeSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80, "Use 80 characters or fewer"),
  category: z.enum(
    ["gas", "electrical", "energy", "fire", "licence", "health_and_safety", "insurance", "other"],
    "Choose a category",
  ),
  /** Blank: no fixed cycle, the date is typed in each time. */
  validityMonths: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(wholeNumber("validity", 1, 240).nullable()),
  alertWindowDays: wholeNumber("alert window", 0, 365),
  requiresDocument: z.enum(["yes", "no"]).transform((value) => value === "yes"),
  documentType: z.enum([
    "gas_safety",
    "eicr",
    "epc",
    "hmo_licence",
    "fire_risk_assessment",
    "other",
  ]),
  autoCreateJob: z.enum(["yes", "no"]).transform((value) => value === "yes"),
  expiryLabel: z
    .string()
    .trim()
    .min(1, "Say what the date is called")
    .max(40, "Use 40 characters or fewer"),
  fields: fieldsSchema,
});

export type ServiceTypeInput = z.infer<typeof serviceTypeSchema>;

/** The document types a certificate can be filed under. */
export const CERTIFICATE_DOCUMENT_TYPES = [
  "gas_safety",
  "eicr",
  "epc",
  "hmo_licence",
  "fire_risk_assessment",
  "other",
] as const;

export function serviceTypeFormValues(
  type?: Pick<
    Row,
    | "name"
    | "category"
    | "validity_months"
    | "alert_window_days"
    | "requires_document"
    | "document_type"
    | "auto_create_job"
    | "expiry_label"
  >,
): ServiceTypeFormValues {
  return {
    name: type?.name ?? "",
    category: type?.category ?? "other",
    validityMonths: type?.validity_months ? String(type.validity_months) : "",
    alertWindowDays: String(type?.alert_window_days ?? 30),
    requiresDocument: type?.requires_document === false ? "no" : "yes",
    documentType: type?.document_type ?? "other",
    autoCreateJob: type?.auto_create_job ? "yes" : "no",
    expiryLabel: type?.expiry_label ?? "Expires",
  };
}

/** "Every 12 months", "Every 5 years", or "No fixed cycle". */
export function validityLabel(months: number | null) {
  if (!months) return "No fixed cycle";
  if (months % 12 === 0) return months === 12 ? "Every year" : `Every ${months / 12} years`;
  return months === 1 ? "Every month" : `Every ${months} months`;
}

export type { ServiceField };
