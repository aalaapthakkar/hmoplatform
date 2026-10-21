import { formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/document";

type Tables = Database["public"]["Tables"];

/** The shape the Documents section selects. */
export type DocumentListRow = Pick<
  Tables["documents"]["Row"],
  "id" | "document_type" | "file_name" | "expiry_date" | "status" | "created_at"
> & { users: Pick<Tables["users"]["Row"], "full_name" | "email"> | null };

export type ExpiryState = "none" | "valid" | "soon" | "expired";

export type DocumentSummary = {
  id: string;
  typeLabel: string;
  fileName: string;
  expiry: string | null;
  expiryState: ExpiryState;
  uploadedBy: string;
  uploadedOn: string;
  active: boolean;
};

const SOON_DAYS = 30;

/** Adds days to a "YYYY-MM-DD" date. */
function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Expired once the expiry date is before today; "soon" within 30 days. */
export function expiryState(expiryDate: string | null, today: string): ExpiryState {
  if (!expiryDate) return "none";
  if (expiryDate < today) return "expired";
  if (expiryDate <= addDays(today, SOON_DAYS)) return "soon";
  return "valid";
}

export function summariseDocument(row: DocumentListRow, today: string): DocumentSummary {
  return {
    id: row.id,
    typeLabel: DOCUMENT_TYPE_LABELS[row.document_type],
    fileName: row.file_name,
    expiry: row.expiry_date ? formatUkDate(row.expiry_date) : null,
    expiryState: expiryState(row.expiry_date, today),
    uploadedBy: row.users?.full_name ?? row.users?.email ?? "Someone who has left",
    uploadedOn: formatUkDate(row.created_at),
    active: row.status === "active",
  };
}
