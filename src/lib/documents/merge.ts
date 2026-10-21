import { formatPence, formatUkDate } from "@/lib/format";
import { dueDayLabel } from "@/lib/tenancies/status";
import type { Database } from "@/lib/supabase/database.types";

export type TemplateKind = Database["public"]["Enums"]["document_template_kind"];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  tenancy_agreement: "Tenancy agreement",
  guarantor_agreement: "Guarantor agreement",
};

type MergeField = { key: string; label: string; example: string; guarantorOnly?: boolean };

/** The {{fields}} a template can use, with an example for previews. */
export const MERGE_FIELDS: MergeField[] = [
  { key: "tenant_name", label: "Tenant's name", example: "Priya Shah" },
  { key: "tenant_email", label: "Tenant's email", example: "priya@example.com" },
  { key: "room", label: "Room", example: "Room 2" },
  { key: "property_address", label: "Property address", example: "42 Ash Grove, Leeds LS6 3HD" },
  { key: "rent", label: "Rent", example: "£550.00" },
  { key: "rent_frequency", label: "Rent frequency", example: "per month" },
  { key: "rent_due_day", label: "Rent due", example: "1st of the month" },
  { key: "deposit", label: "Deposit", example: "£634.61" },
  { key: "start_date", label: "Start date", example: "01/09/2026" },
  { key: "today", label: "Today's date", example: "21/10/2026" },
  { key: "organisation_name", label: "Your organisation", example: "Northern Rooms Ltd" },
  { key: "landlord_name", label: "Landlord", example: "Margaret Ellison" },
  { key: "guarantor_name", label: "Guarantor's name", example: "Sam Shah", guarantorOnly: true },
  {
    key: "guarantor_address",
    label: "Guarantor's address",
    example: "3 Old Street, Manchester M1 1AA",
    guarantorOnly: true,
  },
];

export function fieldsFor(kind: TemplateKind) {
  return MERGE_FIELDS.filter((field) => kind === "guarantor_agreement" || !field.guarantorOnly);
}

const FIELD_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Every {{field}} a template uses, once each, in order. */
export function usedFields(body: string): string[] {
  return [...new Set([...body.matchAll(FIELD_PATTERN)].map((match) => match[1]!))];
}

/** Fields a template uses that don't exist for its kind (such as a guarantor field in a tenancy agreement). */
export function unknownFields(body: string, kind: TemplateKind): string[] {
  const allowed = new Set(fieldsFor(kind).map((field) => field.key));
  return usedFields(body).filter((field) => !allowed.has(field));
}

export type MergeValues = Partial<Record<string, string | null>>;

/** Fills in the {{fields}}. Anything missing shows as "[not set]" so it can't go unnoticed. */
export function mergeTemplate(body: string, values: MergeValues): string {
  return body.replace(FIELD_PATTERN, (_, key: string) => values[key]?.trim() || "[not set]");
}

export function exampleValues(): MergeValues {
  return Object.fromEntries(MERGE_FIELDS.map((field) => [field.key, field.example]));
}

export type Block =
  | { type: "heading"; level: 1 | 2; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

/**
 * The simple formatting templates use: "# " and "## " headings, "- " bullet
 * points, and blank lines between paragraphs. Everything else is plain text.
 */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    if (list.length) blocks.push({ type: "list", items: list });
    paragraph = [];
    list = [];
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "heading", level: 2, text: line.slice(3).trim() });
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ type: "heading", level: 1, text: line.slice(2).trim() });
    } else if (line.startsWith("- ")) {
      if (paragraph.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type TenancyMergeSource = {
  tenantName: string;
  tenantEmail: string | null;
  room: string;
  propertyAddress: string;
  rentPence: number;
  rentFrequency: string;
  rentDueDay: number;
  depositPence: number;
  startDate: string;
  organisationName: string;
  landlordName: string | null;
  guarantorName?: string | null;
  guarantorAddress?: string | null;
  today: string;
};

/** The values for a real tenancy, formatted for UK readers. */
export function tenancyMergeValues(source: TenancyMergeSource): MergeValues {
  return {
    tenant_name: source.tenantName,
    tenant_email: source.tenantEmail,
    room: source.room,
    property_address: source.propertyAddress,
    rent: formatPence(source.rentPence),
    rent_frequency: source.rentFrequency === "weekly" ? "per week" : "per month",
    // Reads after "due on the": "1st of the month" or "Friday of each week".
    rent_due_day:
      source.rentFrequency === "weekly"
        ? `${WEEKDAYS[source.rentDueDay - 1] ?? "same day"} of each week`
        : dueDayLabel(source.rentFrequency, source.rentDueDay),
    deposit: formatPence(source.depositPence),
    start_date: formatUkDate(source.startDate),
    today: formatUkDate(source.today),
    organisation_name: source.organisationName,
    // With no separate owner, the organisation is the landlord.
    landlord_name: source.landlordName ?? source.organisationName,
    guarantor_name: source.guarantorName ?? null,
    guarantor_address: source.guarantorAddress ?? null,
  };
}
