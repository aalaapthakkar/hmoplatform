import { describe, expect, it } from "vitest";
import { parseTenantHomes, primaryHome, rentSummary, type TenantHome } from "./home";

const home = (overrides: Partial<TenantHome> = {}): Record<string, unknown> => ({
  tenancyId: "6f1c1d2e-0000-4000-8000-000000000001",
  status: "active",
  startDate: "2026-09-01",
  endDate: null,
  rentPence: 55_000,
  rentFrequency: "monthly",
  rentDueDay: 1,
  depositPence: 63_461,
  organisation: "Northside Lettings",
  roomId: "6f1c1d2e-0000-4000-8000-000000000002",
  room: { name: "Room 1", sizeSqm: "11.50", features: ["Double bed"] },
  property: {
    id: "6f1c1d2e-0000-4000-8000-000000000003",
    address: "12 High Street, Leeds LS6 2AB",
    amenities: ["Wi-Fi"],
    houseRules: null,
    billsIncluded: true,
    welcomePack: "# Welcome",
  },
  ...overrides,
});

describe("parseTenantHomes", () => {
  it("reads tenant_home() and drops anything malformed", () => {
    const homes = parseTenantHomes([home(), { tenancyId: "nope" }]);
    expect(homes).toHaveLength(1);
    expect(homes[0]).toMatchObject({ room: { name: "Room 1", sizeSqm: 11.5 } });
    expect(parseTenantHomes(null)).toEqual([]);
  });
});

describe("primaryHome", () => {
  it("prefers the tenancy they live in, then the next one, then the latest past one", () => {
    const [past, upcoming, current] = parseTenantHomes([
      home({ tenancyId: "6f1c1d2e-0000-4000-8000-00000000000a", status: "ended" }),
      home({
        tenancyId: "6f1c1d2e-0000-4000-8000-00000000000b",
        status: "prospective",
        startDate: "2027-01-01",
      }),
      home({ tenancyId: "6f1c1d2e-0000-4000-8000-00000000000c", status: "ending" }),
    ]);
    expect(primaryHome([past!, upcoming!, current!])).toBe(current);
    expect(primaryHome([past!, upcoming!])).toBe(upcoming);
    expect(primaryHome([past!])).toBe(past);
    expect(primaryHome([])).toBeNull();
  });
});

describe("rentSummary", () => {
  it("says how much and when", () => {
    expect(rentSummary({ rentPence: 55_000, rentFrequency: "monthly", rentDueDay: 1 })).toBe(
      "£550.00 a month, due on the 1st of the month",
    );
    expect(rentSummary({ rentPence: 13_000, rentFrequency: "weekly", rentDueDay: 5 })).toBe(
      "£130.00 a week, due on Fridays",
    );
  });
});
