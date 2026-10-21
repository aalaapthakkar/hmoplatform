import { z } from "zod";
import { formatPence, formatUkDate } from "@/lib/format";
import { rentLabel, sortRooms } from "@/lib/properties/rooms";
import type { Database } from "@/lib/supabase/database.types";
import { groupTenancies } from "@/lib/tenancies/status";

type Tables = Database["public"]["Tables"];

/** Every room in the org with its property and tenancies, as the Occupancy page selects them. */
export type OccupancyRoomRow = Pick<
  Tables["rooms"]["Row"],
  "id" | "name" | "status" | "rent_pence" | "rent_frequency"
> & {
  properties: Pick<
    Tables["properties"]["Row"],
    "id" | "address_line_1" | "postcode" | "status"
  > | null;
  tenancies: (Pick<
    Tables["tenancies"]["Row"],
    "id" | "status" | "start_date" | "end_date" | "rent_pence" | "rent_frequency"
  > & {
    tenancy_tenants: (Pick<Tables["tenancy_tenants"]["Row"], "status"> & {
      tenants: Pick<Tables["tenants"]["Row"], "first_name" | "last_name"> | null;
    })[];
  })[];
};

export const OCCUPANCY_STATUSES = ["let", "notice", "vacant", "unavailable"] as const;
export type OccupancyStatus = (typeof OCCUPANCY_STATUSES)[number];

export const OCCUPANCY_STATUS_LABELS: Record<OccupancyStatus, string> = {
  let: "Let",
  notice: "Notice given",
  vacant: "Vacant",
  unavailable: "Unavailable",
};

export type OccupancyRow = {
  roomId: string;
  propertyId: string;
  property: string;
  postcode: string;
  room: string;
  status: OccupancyStatus;
  statusLabel: string;
  tenant: string;
  rent: string;
  moveIn: string;
  /** "Now", the last day once notice is given, or "" while let with no end in sight. */
  vacancy: string;
  nextMoveIn: string;
};

function tenantNames(tenancy: OccupancyRoomRow["tenancies"][number] | null) {
  return (
    tenancy?.tenancy_tenants
      .filter((link) => link.status === "active" && link.tenants)
      .map((link) => `${link.tenants!.first_name} ${link.tenants!.last_name}`)
      .join(" and ") ?? ""
  );
}

/** One row per room that's in use: archived rooms and inactive properties are left out. */
export function buildOccupancy(rooms: OccupancyRoomRow[]): OccupancyRow[] {
  const live = rooms.filter(
    (room) => room.status !== "archived" && room.properties?.status === "active",
  );
  const byProperty = [...live].sort((a, b) =>
    a.properties!.address_line_1.localeCompare(b.properties!.address_line_1, "en-GB", {
      numeric: true,
    }),
  );
  // Keep each property's rooms together, in natural order.
  const ordered: OccupancyRoomRow[] = [];
  for (const room of byProperty) {
    if (ordered.includes(room)) continue;
    ordered.push(
      ...sortRooms(byProperty.filter((other) => other.properties!.id === room.properties!.id)),
    );
  }

  return ordered.map((room) => {
    const dates = room.tenancies.map((tenancy) => ({
      ...tenancy,
      startDate: tenancy.start_date,
      endDate: tenancy.end_date,
    }));
    const { current, upcoming } = groupTenancies(dates);
    const status: OccupancyStatus = current
      ? current.status === "ending"
        ? "notice"
        : "let"
      : room.status === "unavailable"
        ? "unavailable"
        : "vacant";

    return {
      roomId: room.id,
      propertyId: room.properties!.id,
      property: room.properties!.address_line_1,
      postcode: room.properties!.postcode,
      room: room.name,
      status,
      statusLabel: OCCUPANCY_STATUS_LABELS[status],
      tenant: tenantNames(current),
      rent: current
        ? `${formatPence(current.rent_pence)} per ${current.rent_frequency === "weekly" ? "week" : "month"}`
        : rentLabel(room.rent_pence, room.rent_frequency),
      moveIn: current ? formatUkDate(current.start_date) : "",
      vacancy:
        status === "vacant"
          ? "Now"
          : status === "notice" && current?.end_date
            ? formatUkDate(current.end_date)
            : "",
      nextMoveIn: upcoming ? formatUkDate(upcoming.start_date) : "",
    };
  });
}

export const occupancyFiltersSchema = z.object({
  property: z.uuid().optional().catch(undefined),
  status: z.enum(OCCUPANCY_STATUSES).optional().catch(undefined),
});
export type OccupancyFilters = z.infer<typeof occupancyFiltersSchema>;

export function parseOccupancyFilters(params: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return occupancyFiltersSchema.parse({
    property: first(params.property) || undefined,
    status: first(params.status) || undefined,
  });
}

export function filterOccupancy(rows: OccupancyRow[], filters: OccupancyFilters) {
  return rows.filter(
    (row) =>
      (!filters.property || row.propertyId === filters.property) &&
      (!filters.status || row.status === filters.status),
  );
}

/** The query string for a set of filters, e.g. "?status=vacant". */
export function occupancyQuery(filters: OccupancyFilters) {
  const params = new URLSearchParams();
  if (filters.property) params.set("property", filters.property);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** e.g. "12 rooms · 9 let (2 with notice) · 2 vacant · 1 unavailable". */
export function occupancySummary(rows: OccupancyRow[]) {
  const count = (status: OccupancyStatus) => rows.filter((row) => row.status === status).length;
  const notice = count("notice");
  const parts = [
    `${rows.length} ${rows.length === 1 ? "room" : "rooms"}`,
    `${count("let") + notice} let${notice ? ` (${notice} with notice)` : ""}`,
    `${count("vacant")} vacant`,
  ];
  if (count("unavailable")) parts.push(`${count("unavailable")} unavailable`);
  return parts.join(" · ");
}

const CSV_COLUMNS: [string, keyof OccupancyRow][] = [
  ["Property", "property"],
  ["Postcode", "postcode"],
  ["Room", "room"],
  ["Status", "statusLabel"],
  ["Tenant", "tenant"],
  ["Rent", "rent"],
  ["Moved in", "moveIn"],
  ["Vacant from", "vacancy"],
  ["Next tenant from", "nextMoveIn"],
];

/**
 * A CSV cell: quoted, with quotes doubled. Text that a spreadsheet would run
 * as a formula (starting = + - @ or a tab or return) is prefixed with '.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The occupancy as CSV, with a byte order mark so Excel reads the £ sign. */
export function occupancyCsv(rows: OccupancyRow[]): string {
  const lines = [
    CSV_COLUMNS.map(([header]) => csvCell(header)).join(","),
    ...rows.map((row) => CSV_COLUMNS.map(([, key]) => csvCell(String(row[key]))).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
