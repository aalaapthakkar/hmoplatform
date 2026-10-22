import { z } from "zod";
import { formatUkDate } from "@/lib/format";
import type { ServiceField } from "@/lib/supabase/database.types";
import { isRealDate } from "@/lib/validation/dates";

export type { ServiceField };

export const FIELD_KIND_LABELS: Record<ServiceField["kind"], string> = {
  text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  choice: "Choice from a list",
};

/** A machine name for a label: "Licence number" becomes "licence_number". */
export function fieldKey(label: string) {
  const key = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(key) ? key : `field_${key}`.slice(0, 40);
}

const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a simple name"),
    label: z
      .string()
      .trim()
      .min(1, "Give each field a label")
      .max(60, "Use 60 characters or fewer"),
    kind: z.enum(["text", "number", "date", "long_text", "choice"]),
    options: z
      .array(z.string().trim().min(1).max(60))
      .max(20, "Use 20 options or fewer")
      .optional(),
  })
  .refine((field) => field.kind !== "choice" || (field.options?.length ?? 0) > 0, {
    message: "Give a choice at least one option",
    path: ["options"],
  });

/** A type's extra fields, as the database checks them: up to 20, unique keys. */
export const fieldsSchema = z
  .array(fieldSchema)
  .max(20, "Use 20 extra fields or fewer")
  .refine((fields) => new Set(fields.map((field) => field.key)).size === fields.length, {
    message: "Two extra fields have the same name",
  });

export type DetailValue = string | number | null;

/**
 * Turns form answers (all strings) into stored details for a type's fields:
 * blanks become null, numbers become numbers, dates and choices are checked.
 * Returns the errors by key, or the details.
 */
export function parseDetails(
  fields: ServiceField[],
  input: Record<string, string | undefined>,
):
  | { ok: true; details: Record<string, DetailValue> }
  | { ok: false; errors: Record<string, string> } {
  const details: Record<string, DetailValue> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = (input[field.key] ?? "").trim();
    if (!raw) {
      details[field.key] = null;
      continue;
    }
    if (raw.length > 2000) {
      errors[field.key] = "Use 2,000 characters or fewer";
    } else if (field.kind === "number") {
      const value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value)) errors[field.key] = "Enter a number";
      else details[field.key] = value;
    } else if (field.kind === "date") {
      if (!isRealDate(raw)) errors[field.key] = "Enter a real date";
      else details[field.key] = raw;
    } else if (field.kind === "choice") {
      if (!field.options?.includes(raw)) errors[field.key] = "Choose one of the options";
      else details[field.key] = raw;
    } else {
      details[field.key] = raw;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, details };
}

/** A stored detail for display: dates in UK format, numbers with commas. */
export function formatDetail(field: ServiceField, value: DetailValue | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field.kind === "date" && typeof value === "string") return formatUkDate(value);
  if (typeof value === "number") return value.toLocaleString("en-GB");
  return String(value);
}

/** Stored details back to strings for a form. */
export function detailsToForm(
  fields: ServiceField[],
  details: Record<string, DetailValue>,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      details[field.key] == null ? "" : String(details[field.key]),
    ]),
  );
}
