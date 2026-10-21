import { describe, expect, it } from "vitest";
import {
  buildOccupancy,
  csvCell,
  filterOccupancy,
  occupancyCsv,
  occupancyQuery,
  occupancySummary,
  type OccupancyRoomRow,
  parseOccupancyFilters,
} from "./occupancy";

const LEEDS = {
  id: "p-leeds",
  address_line_1: "42 Ash Grove",
  postcode: "LS6 3HD",
  status: "active" as const,
};
const MANCHESTER = {
  id: "p-man",
  address_line_1: "18 Copperfield Road",
  postcode: "M14 6PZ",
  status: "active" as const,
};

const tenant = (first: string) => ({
  status: "active" as const,
  tenants: { first_name: first, last_name: "Shah" },
});

function room(overrides: Partial<OccupancyRoomRow>): OccupancyRoomRow {
  return {
    id: "r",
    name: "Room 1",
    status: "available",
    rent_pence: 52_000,
    rent_frequency: "monthly",
    properties: LEEDS,
    tenancies: [],
    ...overrides,
  };
}

const tenancy = (
  status: "active" | "ending" | "prospective" | "ended",
  start: string,
  end: string | null = null,
  names: string[] = [],
) => ({
  id: `${status}-${start}`,
  status,
  start_date: start,
  end_date: end,
  rent_pence: 55_000,
  rent_frequency: "monthly" as const,
  tenancy_tenants: names.map(tenant),
});

const rows = buildOccupancy([
  room({
    id: "r2",
    name: "Room 10",
    tenancies: [tenancy("ending", "2026-01-01", "2026-12-31", ["Priya"])],
  }),
  room({ id: "r1", name: "Room 2", tenancies: [tenancy("active", "2026-09-01", null, ["Tom"])] }),
  room({
    id: "r3",
    name: "Room 1",
    properties: MANCHESTER,
    tenancies: [
      tenancy("ended", "2025-09-01", "2026-08-31", ["Old"]),
      tenancy("prospective", "2026-11-01"),
    ],
  }),
  room({ id: "r4", name: "Room 3", status: "unavailable" }),
  room({ id: "r5", name: "Gone", status: "archived" }),
  room({ id: "r6", name: "Room 1", properties: { ...LEEDS, id: "p-old", status: "archived" } }),
]);

describe("buildOccupancy", () => {
  it("lists rooms in use by property, rooms in natural order, skipping archived ones", () => {
    expect(rows.map((row) => `${row.property} / ${row.room}`)).toEqual([
      "18 Copperfield Road / Room 1",
      "42 Ash Grove / Room 2",
      "42 Ash Grove / Room 3",
      "42 Ash Grove / Room 10",
    ]);
  });

  it("shows status, tenant, rent and when each room is free", () => {
    const byRoom = Object.fromEntries(rows.map((row) => [row.roomId, row]));
    expect(byRoom.r1).toMatchObject({
      status: "let",
      tenant: "Tom Shah",
      rent: "£550.00 per month",
      moveIn: "01/09/2026",
      vacancy: "",
    });
    expect(byRoom.r2).toMatchObject({
      status: "notice",
      statusLabel: "Notice given",
      tenant: "Priya Shah",
      vacancy: "31/12/2026",
    });
    expect(byRoom.r3).toMatchObject({
      status: "vacant",
      tenant: "",
      rent: "£520.00 per month",
      vacancy: "Now",
      nextMoveIn: "01/11/2026",
    });
    expect(byRoom.r4).toMatchObject({ status: "unavailable", vacancy: "" });
  });
});

describe("filters and summary", () => {
  it("filters by property and status", () => {
    expect(filterOccupancy(rows, { status: "vacant" }).map((row) => row.roomId)).toEqual(["r3"]);
    expect(filterOccupancy(rows, { property: "p-leeds" })).toHaveLength(3);
  });

  it("reads filters from the URL, ignoring anything unexpected", () => {
    expect(parseOccupancyFilters({ status: "notice", property: "nope" })).toEqual({
      status: "notice",
      property: undefined,
    });
    expect(occupancyQuery({ status: "vacant" })).toBe("?status=vacant");
    expect(occupancyQuery({})).toBe("");
  });

  it("totals the rooms", () => {
    expect(occupancySummary(rows)).toBe(
      "4 rooms · 2 let (1 with notice) · 1 vacant · 1 unavailable",
    );
  });
});

describe("CSV", () => {
  it("quotes every cell and defuses spreadsheet formulas", () => {
    expect(csvCell('Flat "B"')).toBe('"Flat ""B"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
  });

  it("has a header, one line per room, UK dates and £ amounts, and no contact details", () => {
    const csv = occupancyCsv(rows);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      '"Property","Postcode","Room","Status","Tenant","Rent","Moved in","Vacant from","Next tenant from"',
    );
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe(
      '"42 Ash Grove","LS6 3HD","Room 10","Notice given","Priya Shah","£550.00 per month","01/01/2026","31/12/2026",""',
    );
    expect(csv).not.toMatch(/@|07700/);
  });
});
