import { formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { addDays } from "@/lib/validation/dates";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/document";

type Tables = Database["public"]["Tables"];

/** The shape the Documents section selects. */
export type DocumentListRow = Pick<
  Tables["documents"]["Row"],
  "id" | "document_type" | "file_name" | "expiry_date" | "status" | "created_at"
> & {
  users: Pick<Tables["users"]["Row"], "full_name" | "email"> | null;
  document_services?: Pick<Tables["document_services"]["Row"], "tenancy_id" | "served_at">[];
};

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
  /** Tenancies it has been given to, through their portal. */
  servedTo: { tenancyId: string; servedOn: string }[];
};

const SOON_DAYS = 30;

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
    servedTo: (row.document_services ?? []).map((service) => ({
      tenancyId: service.tenancy_id,
      servedOn: formatUkDate(service.served_at),
    })),
  };
}
