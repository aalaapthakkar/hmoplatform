import { describe, expect, it } from "vitest";
import {
  buildGrid,
  complianceCsv,
  complianceQuery,
  listItems,
  parseComplianceFilters,
} from "./dashboard";
import type { ComplianceItem } from "./status";

function item(
  property: string,
  type: string,
  status: ComplianceItem["status"],
  daysLeft: number | null,
  extra: Partial<ComplianceItem> = {},
): ComplianceItem {
  return {
    org_id: "org",
    property_id: property,
    service_type_id: type,
    property_service_id: daysLeft === null ? null : `${property}-${type}`,
    service_name: { gas: "Gas safety", eicr: "EICR", licence: "HMO licence" }[type] ?? type,
    category: ({ gas: "gas", eicr: "electrical", licence: "licence" } as const)[
      type as "gas" | "eicr" | "licence"
    ],
    system_key: type,
    validity_months: 12,
    alert_window_days: 30,
    requires_document: true,
    auto_create_job: false,
    expiry_label: "Expires",
    last_done_on: null,
    expires_on: daysLeft === null ? null : "2026-11-20",
    document_id: null,
    notes: null,
    details: {},
    not_required: status === "not_needed",
    not_required_reason: status === "not_needed" ? "No gas" : null,
    days_left: daysLeft,
    status,
    ...extra,
  };
}

const ITEMS = [
  item("p1", "gas", "ok", 200),
  item("p1", "eicr", "due_soon", 20),
  item("p1", "licence", "missing", null),
  item("p2", "gas", "not_needed", null),
  item("p2", "eicr", "overdue", -5),
  item("p2", "licence", "ok", 900, {
    details: { licence_number: "HMO/1", max_occupants: 6 },
    document_id: "d1",
  }),
];
const LABELS = new Map([
  ["p1", "1 Alpha Road, LS1 1AA"],
  ["p2", "2 Beta Road, LS2 2BB"],
]);

describe("parseComplianceFilters", () => {
  it("reads filters and drops anything odd", () => {
    expect(parseComplianceFilters({})).toEqual({ view: "grid" });
    expect(parseComplianceFilters({ rag: "purple", within: "45", category: "x" })).toEqual({
      view: "grid",
    });
    expect(
      parseComplianceFilters({ rag: "red", within: "30", category: "gas", view: "list" }),
    ).toEqual({ rag: "red", within: 30, category: "gas", view: "list" });
    expect(complianceQuery({ rag: "amber", view: "grid" })).toBe("?rag=amber");
  });
});

describe("buildGrid", () => {
  it("puts properties down the side and types across, in category order", () => {
    const grid = buildGrid(ITEMS, LABELS, { view: "grid" });
    expect(grid.columns.map((column) => column.name)).toEqual([
      "Gas safety",
      "EICR",
      "HMO licence",
    ]);
    expect(grid.rows.map((row) => row.label)).toEqual([
      "1 Alpha Road, LS1 1AA",
      "2 Beta Road, LS2 2BB",
    ]);
  });

  it("keeps only rows with a matching item, and fades the rest", () => {
    const grid = buildGrid(ITEMS, LABELS, { rag: "red", view: "grid" });
    expect(grid.rows).toHaveLength(2);
    const p1 = grid.rows[0]!;
    expect(
      Object.values(p1.cells).map((cell) => [cell.item.service_type_id, cell.matches]),
    ).toEqual([
      ["gas", false],
      ["eicr", false],
      ["licence", true],
    ]);
    const amberOnly = buildGrid(ITEMS, LABELS, { rag: "amber", view: "grid" });
    expect(amberOnly.rows.map((row) => row.propertyId)).toEqual(["p1"]);
  });

  it("narrows columns by category and rows by property", () => {
    const grid = buildGrid(ITEMS, LABELS, { category: "electrical", property: "p2", view: "grid" });
    expect(grid.columns.map((column) => column.name)).toEqual(["EICR"]);
    expect(grid.rows.map((row) => row.propertyId)).toEqual(["p2"]);
  });
});

describe("listItems", () => {
  it("lists matches worst first, with 'due within' including overdue", () => {
    expect(
      listItems(ITEMS, { view: "list" }).map((i) => `${i.property_id}:${i.service_type_id}`),
    ).toEqual(["p2:eicr", "p1:licence", "p1:eicr", "p1:gas", "p2:licence", "p2:gas"]);
    expect(
      listItems(ITEMS, { within: 30, view: "list" }).map(
        (i) => `${i.property_id}:${i.service_type_id}`,
      ),
    ).toEqual(["p2:eicr", "p1:eicr"]);
  });
});

describe("complianceCsv", () => {
  it("has one row per item with UK dates and the extra details", () => {
    const fields = new Map([
      [
        "licence",
        [
          { key: "licence_number", label: "Licence number", kind: "text" as const },
          { key: "max_occupants", label: "Maximum occupants", kind: "number" as const },
        ],
      ],
    ]);
    const lines = complianceCsv(ITEMS.slice(3), LABELS, fields).split("\r\n");
    expect(lines[0]!.startsWith('﻿"Property","Type"')).toBe(true);
    expect(lines[1]).toBe(
      '"2 Beta Road, LS2 2BB","Gas safety","Gas","Not needed","","","","No","","No gas"',
    );
    expect(lines[3]).toBe(
      '"2 Beta Road, LS2 2BB","HMO licence","Licences and registration","OK","","20/11/2026","900","Yes","Licence number: HMO/1; Maximum occupants: 6",""',
    );
  });
});
