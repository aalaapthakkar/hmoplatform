import { formatUkDate } from "@/lib/format";
import { csvCell } from "@/lib/occupancy";
import type { ServiceField } from "./fields";
import { formatDetail } from "./fields";
import {
  byUrgency,
  CATEGORIES,
  CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  type ComplianceCategory,
  type ComplianceItem,
  type Rag,
  ragOf,
} from "./status";

export const RAGS: Rag[] = ["red", "amber", "green", "grey"];

export type ComplianceFilters = {
  rag?: Rag;
  category?: ComplianceCategory;
  property?: string;
  /** Due within this many days (overdue included). */
  within?: number;
  view: "grid" | "list";
};

const WITHIN_CHOICES = [7, 30, 60, 90] as const;
export const WITHIN_OPTIONS: readonly number[] = WITHIN_CHOICES;

/** Reads the dashboard's filters from the URL, ignoring anything unexpected. */
export function parseComplianceFilters(
  params: Record<string, string | string[] | undefined>,
): ComplianceFilters {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const rag = one(params.rag);
  const category = one(params.category);
  const property = one(params.property);
  const within = Number(one(params.within));
  return {
    rag: (RAGS as string[]).includes(rag ?? "") ? (rag as Rag) : undefined,
    category: (CATEGORIES as string[]).includes(category ?? "")
      ? (category as ComplianceCategory)
      : undefined,
    property: property && /^[0-9a-f-]{36}$/i.test(property) ? property : undefined,
    within: WITHIN_OPTIONS.includes(within) ? within : undefined,
    view: one(params.view) === "list" ? "list" : "grid",
  };
}

/** "?rag=red&view=list", leaving out what isn't set (and the default grid view). */
export function complianceQuery(filters: Partial<ComplianceFilters>) {
  const params = new URLSearchParams();
  if (filters.rag) params.set("rag", filters.rag);
  if (filters.category) params.set("category", filters.category);
  if (filters.property) params.set("property", filters.property);
  if (filters.within) params.set("within", String(filters.within));
  if (filters.view === "list") params.set("view", "list");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Whether an item matches the filters (except the property, which picks rows). */
export function matchesFilters(item: ComplianceItem, filters: ComplianceFilters) {
  if (filters.rag && ragOf(item.status) !== filters.rag) return false;
  if (filters.category && item.category !== filters.category) return false;
  if (filters.within !== undefined) {
    if (item.days_left === null || item.not_required || item.days_left > filters.within) {
      return false;
    }
  }
  return true;
}

export type GridColumn = { serviceTypeId: string; name: string; category: ComplianceCategory };
export type GridRow = {
  propertyId: string;
  label: string;
  /** By service type id. Faded cells don't match the filters. */
  cells: Record<string, { item: ComplianceItem; matches: boolean }>;
};

/**
 * Properties down the side, types across the top. Columns follow the
 * category filter; rows are properties with at least one matching item.
 */
export function buildGrid(
  items: ComplianceItem[],
  propertyLabels: Map<string, string>,
  filters: ComplianceFilters,
): { columns: GridColumn[]; rows: GridRow[] } {
  const columns = [
    ...new Map(
      items
        .filter((item) => !filters.category || item.category === filters.category)
        .map((item) => [
          item.service_type_id,
          { serviceTypeId: item.service_type_id, name: item.service_name, category: item.category },
        ]),
    ).values(),
  ].sort(
    (a, b) =>
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
      a.name.localeCompare(b.name),
  );
  const shown = new Set(columns.map((column) => column.serviceTypeId));

  const byProperty = new Map<string, GridRow>();
  for (const item of items) {
    if (filters.property && item.property_id !== filters.property) continue;
    if (!shown.has(item.service_type_id)) continue;
    const row = byProperty.get(item.property_id) ?? {
      propertyId: item.property_id,
      label: propertyLabels.get(item.property_id) ?? "Property",
      cells: {},
    };
    row.cells[item.service_type_id] = { item, matches: matchesFilters(item, filters) };
    byProperty.set(item.property_id, row);
  }
  const rows = [...byProperty.values()]
    .filter((row) => Object.values(row.cells).some((cell) => cell.matches))
    .sort((a, b) => a.label.localeCompare(b.label, "en-GB", { numeric: true }));
  return { columns, rows };
}

/** The matching items, worst first, for the list view and the CSV. */
export function listItems(items: ComplianceItem[], filters: ComplianceFilters) {
  return items
    .filter((item) => !filters.property || item.property_id === filters.property)
    .filter((item) => matchesFilters(item, filters))
    .sort(byUrgency);
}

/** Items as CSV, with a byte order mark so Excel reads it. Extra details in one column. */
export function complianceCsv(
  items: ComplianceItem[],
  propertyLabels: Map<string, string>,
  fieldsByType: Map<string, ServiceField[]>,
) {
  const header = [
    "Property",
    "Type",
    "Category",
    "Status",
    "Last done",
    "Expires or renews",
    "Days left",
    "Certificate on file",
    "Details",
    "Not needed because",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...items.map((item) =>
      [
        propertyLabels.get(item.property_id) ?? "",
        item.service_name,
        CATEGORY_LABELS[item.category],
        COMPLIANCE_STATUS_LABELS[item.status],
        item.last_done_on ? formatUkDate(item.last_done_on) : "",
        item.expires_on ? formatUkDate(item.expires_on) : "",
        item.days_left === null ? "" : String(item.days_left),
        item.document_id ? "Yes" : "No",
        (fieldsByType.get(item.service_type_id) ?? [])
          .map((field) => {
            const value = formatDetail(field, item.details[field.key]);
            return value ? `${field.label}: ${value}` : null;
          })
          .filter(Boolean)
          .join("; "),
        item.not_required ? (item.not_required_reason ?? "") : "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
