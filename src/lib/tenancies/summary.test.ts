import { describe, expect, it } from "vitest";
import { summariseTenancy, type TenancyRow } from "./summary";

const TODAY = "2026-10-21";

function row(overrides: Partial<TenancyRow> = {}): TenancyRow {
  return {
    id: "t1",
    status: "active",
    start_date: "2026-09-01",
    end_date: null,
    notice_date: null,
    end_reason: null,
    rent_pence: 55_000,
    rent_frequency: "monthly",
    rent_due_day: 1,
    deposit_pence: 63_461,
    tenancy_tenants: [
      {
        status: "active",
        tenants: { first_name: "Priya", last_name: "Shah", email: "p@example.com", phone: null },
      },
    ],
    ...overrides,
  };
}

describe("summariseTenancy", () => {
  it("describes a current periodic tenancy", () => {
    expect(summariseTenancy(row(), TODAY)).toMatchObject({
      group: "current",
      statusLabel: "Current",
      tenantNames: "Priya Shah",
      when: "since 01/09/2026",
      rent: "£550.00 per month",
      dueDay: "1st of the month",
      deposit: "£634.61",
      end: null,
      canMoveIn: false,
      canMarkEnded: false,
    });
  });

  it("asks you to confirm an ended tenancy only once its end date has come", () => {
    const ending = (endDate: string) =>
      summariseTenancy(
        row({
          status: "ending",
          end_date: endDate,
          notice_date: "2026-08-20",
          end_reason: "tenant_notice",
        }),
        TODAY,
      );
    expect(ending("2026-10-22")).toMatchObject({
      group: "current",
      statusLabel: "Notice given",
      when: "leaving 22/10/2026",
      notice: "20/08/2026",
      endReason: "The tenant gave notice",
      canMarkEnded: false,
    });
    expect(ending(TODAY).canMarkEnded).toBe(true);
  });

  it("lets an upcoming tenant move in from the start date", () => {
    expect(
      summariseTenancy(row({ status: "prospective", start_date: "2026-10-22" }), TODAY),
    ).toMatchObject({ group: "upcoming", when: "from 22/10/2026", canMoveIn: false });
    expect(
      summariseTenancy(row({ status: "prospective", start_date: TODAY }), TODAY).canMoveIn,
    ).toBe(true);
  });

  it("describes past and cancelled tenancies", () => {
    expect(
      summariseTenancy(
        row({ status: "ended", end_date: "2026-08-31", end_reason: "tenant_notice" }),
        TODAY,
      ),
    ).toMatchObject({ group: "past", when: "01/09/2026 to 31/08/2026" });
    expect(summariseTenancy(row({ status: "cancelled" }), TODAY)).toMatchObject({
      group: "past",
      statusLabel: "Cancelled",
      when: "cancelled, was due 01/09/2026",
    });
  });

  it("names joint tenants and skips removed ones", () => {
    const tenant = (first: string, status: "active" | "removed" = "active") => ({
      status,
      tenants: { first_name: first, last_name: "Reid", email: null, phone: null },
    });
    expect(
      summariseTenancy(
        row({ tenancy_tenants: [tenant("Callum"), tenant("Amy"), tenant("Old", "removed")] }),
        TODAY,
      ).tenantNames,
    ).toBe("Callum Reid and Amy Reid");
  });
});
