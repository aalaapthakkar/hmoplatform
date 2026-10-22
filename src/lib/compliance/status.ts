import type { Database } from "@/lib/supabase/database.types";
import { addMonths } from "@/lib/validation/dates";

type Views = Database["public"]["Views"];
export type ComplianceItem = Views["compliance_items"]["Row"];
export type ComplianceStatus = ComplianceItem["status"];
export type ComplianceCategory = ComplianceItem["category"];

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  overdue: "Overdue",
  missing: "Missing",
  due_soon: "Due soon",
  ok: "OK",
  not_needed: "Not needed",
};

/** Worst first: how lists and the dashboard sort. */
export const COMPLIANCE_STATUSES: ComplianceStatus[] = [
  "overdue",
  "missing",
  "due_soon",
  "ok",
  "not_needed",
];

export type Rag = "red" | "amber" | "green" | "grey";

/** Red: overdue or missing. Amber: due soon. Green: OK. Grey: not needed here. */
export function ragOf(status: ComplianceStatus): Rag {
  if (status === "overdue" || status === "missing") return "red";
  if (status === "due_soon") return "amber";
  if (status === "ok") return "green";
  return "grey";
}

export const RAG_LABELS: Record<Rag, string> = {
  red: "Overdue or missing",
  amber: "Due soon",
  green: "OK",
  grey: "Not needed",
};

/** Badge and cell colours, readable in light and dark mode. */
export const RAG_CLASSES: Record<Rag, string> = {
  red: "bg-destructive text-white",
  amber: "bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-50",
  green: "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50",
  grey: "bg-muted text-muted-foreground",
};

export const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  gas: "Gas",
  electrical: "Electrical",
  energy: "Energy",
  fire: "Fire safety",
  licence: "Licences and registration",
  health_and_safety: "Health and safety",
  insurance: "Insurance",
  other: "Other",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ComplianceCategory[];

/** When something done on a date runs out, for types with a fixed cycle. */
export function expiryFrom(lastDoneOn: string, validityMonths: number | null): string | null {
  return validityMonths ? addMonths(lastDoneOn, validityMonths) : null;
}

/** "Expired 3 days ago", "Expires today", "Tomorrow", "In 12 days". */
export function daysLeftLabel(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < -1) return `Expired ${-daysLeft} days ago`;
  if (daysLeft === -1) return "Expired yesterday";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "Expires tomorrow";
  return `In ${daysLeft} days`;
}

/** Sorts items worst first, then soonest expiry. */
export function byUrgency(a: ComplianceItem, b: ComplianceItem) {
  return (
    COMPLIANCE_STATUSES.indexOf(a.status) - COMPLIANCE_STATUSES.indexOf(b.status) ||
    (a.days_left ?? Number.MAX_SAFE_INTEGER) - (b.days_left ?? Number.MAX_SAFE_INTEGER) ||
    a.service_name.localeCompare(b.service_name)
  );
}

/** Counts by RAG colour. */
export function ragCounts(items: Pick<ComplianceItem, "status">[]): Record<Rag, number> {
  const counts: Record<Rag, number> = { red: 0, amber: 0, green: 0, grey: 0 };
  for (const item of items) counts[ragOf(item.status)] += 1;
  return counts;
}
