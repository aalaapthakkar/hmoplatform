import { describe, expect, it } from "vitest";
import {
  buildCollection,
  type CollectionSource,
  collectionCsv,
  collectionQuery,
  filterCollection,
  monthLabel,
  parseCollectionFilters,
  shiftMonth,
} from "./collection";
import { buildLedger, type LedgerCharge, type LedgerPayment } from "./ledger";

const TODAY = "2026-10-15";
let clock = 0;
const at = () => `2026-01-01T00:00:${String(clock++).padStart(2, "0")}.000Z`;

const charge = (id: string, due: string, pence = 60000): LedgerCharge => ({
  id,
  due_date: due,
  amount_pence: pence,
  description: `Rent ${due}`,
  kind: "rent",
  reverses_charge_id: null,
  created_at: at(),
});
const payment = (id: string, paid: string, pence: number): LedgerPayment => ({
  id,
  paid_on: paid,
  amount_pence: pence,
  method: "bank_transfer",
  reference: null,
  note: null,
  reverses_payment_id: null,
  created_at: at(),
});

function source(
  id: string,
  property: string,
  charges: LedgerCharge[],
  payments: LedgerPayment[],
): CollectionSource {
  return {
    tenancyId: id,
    tenantNames: `Tenant ${id}`,
    roomName: `Room ${id}`,
    propertyId: property,
    propertyLabel: `${property} Street`,
    ledger: buildLedger(charges, payments, TODAY),
  };
}

const sources = [
  // Paid up.
  source(
    "a",
    "1",
    [charge("a9", "2026-09-01"), charge("a10", "2026-10-01")],
    [payment("ap1", "2026-09-01", 60000), payment("ap2", "2026-10-01", 60000)],
  ),
  // Part paid October, overdue.
  source("b", "1", [charge("b10", "2026-10-01")], [payment("bp1", "2026-10-02", 20000)]),
  // October not due until later this month, nothing paid.
  source("c", "2", [charge("c10", "2026-10-20")], []),
  // Moved out in September, still owes for it.
  source("d", "2", [charge("d9", "2026-09-01")], [payment("dp1", "2026-09-05", 10000)]),
  // Paid September up front; part paid October, not late yet.
  source("e", "2", [charge("e10", "2026-10-28")], [payment("ep1", "2026-10-10", 15000)]),
];

describe("buildCollection", () => {
  const october = buildCollection(sources, "2026-10");

  it("gives each tenancy the month's due, paid, left and status, overdue first", () => {
    expect(
      october.rows.map((row) => [
        row.tenancyId,
        row.duePence,
        row.paidPence,
        row.leftPence,
        row.status,
      ]),
    ).toEqual([
      ["d", 0, 0, 0, null],
      ["b", 60000, 20000, 40000, "overdue"],
      ["e", 60000, 15000, 45000, "part_paid"],
      ["c", 60000, 0, 60000, "due"],
      ["a", 60000, 60000, 0, "paid"],
    ]);
  });

  it("totals the month, and arrears from every month", () => {
    expect(october.totals).toEqual({
      duePence: 240000,
      paidPence: 95000,
      leftPence: 145000,
      arrearsPence: 40000 + 50000,
      tenantsInArrears: 2,
    });
  });

  it("totals by property", () => {
    expect(october.byProperty).toEqual([
      {
        propertyId: "1",
        propertyLabel: "1 Street",
        duePence: 120000,
        paidPence: 80000,
        arrearsPence: 40000,
      },
      {
        propertyId: "2",
        propertyLabel: "2 Street",
        duePence: 120000,
        paidPence: 15000,
        arrearsPence: 50000,
      },
    ]);
  });

  it("looks at any month, leaving out tenancies with nothing due then and no arrears", () => {
    const september = buildCollection(sources, "2026-09");
    expect(september.rows.map((row) => [row.tenancyId, row.status])).toEqual([
      ["d", "overdue"],
      ["b", null],
      ["a", "paid"],
    ]);
  });
});

describe("filterCollection", () => {
  const { rows } = buildCollection(sources, "2026-10");
  it("filters by property and status, with arrears counting as overdue", () => {
    expect(
      filterCollection(rows, { month: "2026-10", status: "overdue" }).map((r) => r.tenancyId),
    ).toEqual(["d", "b"]);
    expect(
      filterCollection(rows, { month: "2026-10", property: "2" }).map((r) => r.tenancyId),
    ).toEqual(["d", "e", "c"]);
    expect(
      filterCollection(rows, { month: "2026-10", status: "paid" }).map((r) => r.tenancyId),
    ).toEqual(["a"]);
  });
});

describe("months and filters", () => {
  it("moves between months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("reads filters from the URL, ignoring anything odd", () => {
    expect(parseCollectionFilters({}, TODAY)).toEqual({ month: "2026-10" });
    expect(
      parseCollectionFilters({ month: "2026-13", status: "late", property: "x" }, TODAY),
    ).toEqual({ month: "2026-10" });
    const property = "6f1c1d2e-0000-4000-8000-000000000001";
    expect(
      parseCollectionFilters({ month: "2026-09", status: "overdue", property }, TODAY),
    ).toEqual({ month: "2026-09", status: "overdue", property });
    expect(collectionQuery({ month: "2026-09", status: "paid" })).toBe(
      "?month=2026-09&status=paid",
    );
  });
});

describe("collectionCsv", () => {
  it("makes a spreadsheet-safe CSV with UK money", () => {
    const { rows } = buildCollection(sources.slice(1, 2), "2026-10");
    const csv = collectionCsv(rows, "2026-10");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")[0]).toContain('"Due in October 2026"');
    expect(csv.split("\r\n")[1]).toBe(
      '"Tenant b","1 Street","Room b","£600.00","£200.00","£400.00","Overdue","£400.00","£400.00"',
    );
  });
});
