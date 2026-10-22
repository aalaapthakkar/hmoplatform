import { csvCell } from "@/lib/occupancy";
import { formatPence } from "@/lib/format";
import type { ChargeStatus, Ledger } from "./ledger";

/** What the collection page needs from each tenancy: who, where, and its ledger. */
export type CollectionSource = {
  tenancyId: string;
  tenantNames: string;
  roomName: string;
  propertyId: string | null;
  propertyLabel: string;
  ledger: Ledger;
};

export type CollectionRow = {
  tenancyId: string;
  tenantNames: string;
  roomName: string;
  propertyId: string | null;
  propertyLabel: string;
  /** Charges falling due in the month. */
  duePence: number;
  /** Paid off those charges so far. */
  paidPence: number;
  leftPence: number;
  /** Paid, overdue, part paid or due, across the month's charges; null with nothing due in it. */
  status: ChargeStatus | null;
  /** Overdue across every month, as of today. */
  arrearsPence: number;
  balancePence: number;
};

export type PropertyCollection = {
  propertyId: string | null;
  propertyLabel: string;
  duePence: number;
  paidPence: number;
  arrearsPence: number;
};

export type Collection = {
  rows: CollectionRow[];
  byProperty: PropertyCollection[];
  totals: {
    duePence: number;
    paidPence: number;
    leftPence: number;
    /** Every month, as of today. */
    arrearsPence: number;
    tenantsInArrears: number;
  };
};

export const COLLECTION_STATUSES = ["overdue", "part_paid", "due", "paid"] as const;

const ORDER: Record<ChargeStatus, number> = { overdue: 0, part_paid: 1, due: 2, paid: 3 };

/** "2026-10": a month, as the page's URL keeps it. */
export type Month = string;

export function isMonth(value: unknown): value is Month {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthOf(date: string): Month {
  return date.slice(0, 7);
}

export function shiftMonth(month: Month, by: number): Month {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (number - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function monthLabel(month: Month): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * Rent collection for a month: one row per tenancy with charges due that
 * month (or arrears from earlier months), the month's totals, and totals by
 * property. Arrears are always as of today, across every month.
 */
export function buildCollection(sources: CollectionSource[], month: Month): Collection {
  const rows: CollectionRow[] = [];
  for (const source of sources) {
    const inMonth = source.ledger.charges.filter((charge) => monthOf(charge.dueDate) === month);
    if (inMonth.length === 0 && source.ledger.arrearsPence === 0) continue;

    const duePence = inMonth.reduce((sum, charge) => sum + charge.amountPence, 0);
    const paidPence = inMonth.reduce((sum, charge) => sum + charge.paidPence, 0);
    const status: ChargeStatus | null =
      inMonth.length === 0
        ? null
        : inMonth.every((charge) => charge.status === "paid")
          ? "paid"
          : inMonth.some((charge) => charge.status === "overdue")
            ? "overdue"
            : paidPence > 0
              ? "part_paid"
              : "due";
    rows.push({
      tenancyId: source.tenancyId,
      tenantNames: source.tenantNames,
      roomName: source.roomName,
      propertyId: source.propertyId,
      propertyLabel: source.propertyLabel,
      duePence,
      paidPence,
      leftPence: duePence - paidPence,
      status,
      arrearsPence: source.ledger.arrearsPence,
      balancePence: source.ledger.balancePence,
    });
  }

  rows.sort(
    (a, b) =>
      (a.status === null ? (a.arrearsPence > 0 ? 0 : 4) : ORDER[a.status]) -
        (b.status === null ? (b.arrearsPence > 0 ? 0 : 4) : ORDER[b.status]) ||
      b.arrearsPence - a.arrearsPence ||
      a.propertyLabel.localeCompare(b.propertyLabel) ||
      a.roomName.localeCompare(b.roomName, "en-GB", { numeric: true }),
  );

  const byPropertyMap = new Map<string, PropertyCollection>();
  for (const row of rows) {
    const key = row.propertyId ?? "";
    const entry = byPropertyMap.get(key) ?? {
      propertyId: row.propertyId,
      propertyLabel: row.propertyLabel,
      duePence: 0,
      paidPence: 0,
      arrearsPence: 0,
    };
    entry.duePence += row.duePence;
    entry.paidPence += row.paidPence;
    entry.arrearsPence += row.arrearsPence;
    byPropertyMap.set(key, entry);
  }

  const sum = (pick: (row: CollectionRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  return {
    rows,
    byProperty: [...byPropertyMap.values()].sort((a, b) =>
      a.propertyLabel.localeCompare(b.propertyLabel),
    ),
    totals: {
      duePence: sum((row) => row.duePence),
      paidPence: sum((row) => row.paidPence),
      leftPence: sum((row) => row.leftPence),
      arrearsPence: sum((row) => row.arrearsPence),
      tenantsInArrears: rows.filter((row) => row.arrearsPence > 0).length,
    },
  };
}

export type CollectionFilters = {
  month: Month;
  property?: string;
  status?: ChargeStatus;
};

/** Reads the page's filters from the URL, falling back to this month and everything. */
export function parseCollectionFilters(
  params: Record<string, string | string[] | undefined>,
  today: string,
): CollectionFilters {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const month = one(params.month);
  const status = one(params.status);
  const property = one(params.property);
  return {
    month: isMonth(month) ? month : monthOf(today),
    property: property && /^[0-9a-f-]{36}$/i.test(property) ? property : undefined,
    status: (COLLECTION_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as ChargeStatus)
      : undefined,
  };
}

/** "?month=2026-10&status=overdue", leaving out what isn't set. */
export function collectionQuery(filters: Partial<CollectionFilters>) {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.property) params.set("property", filters.property);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Rows for the chosen property and status. Overdue includes arrears from earlier months. */
export function filterCollection(rows: CollectionRow[], filters: CollectionFilters) {
  return rows.filter(
    (row) =>
      (!filters.property || row.propertyId === filters.property) &&
      (!filters.status ||
        row.status === filters.status ||
        (filters.status === "overdue" && row.arrearsPence > 0)),
  );
}

const STATUS_WORDS: Record<ChargeStatus, string> = {
  paid: "Paid",
  overdue: "Overdue",
  part_paid: "Part paid",
  due: "Due",
};

/** The rows as CSV, with a byte order mark so Excel reads the £ sign. Names only, no contact details. */
export function collectionCsv(rows: CollectionRow[], month: Month) {
  const header = [
    "Tenant",
    "Property",
    "Room",
    `Due in ${monthLabel(month)}`,
    "Paid",
    "Left to pay",
    "Status",
    "Total overdue",
    "Balance",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.tenantNames,
        row.propertyLabel,
        row.roomName,
        formatPence(row.duePence),
        formatPence(row.paidPence),
        formatPence(row.leftPence),
        row.status ? STATUS_WORDS[row.status] : "Nothing due",
        formatPence(row.arrearsPence),
        formatPence(row.balancePence),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
