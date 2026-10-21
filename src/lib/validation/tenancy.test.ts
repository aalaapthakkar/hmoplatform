import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";
import {
  depositCapPence,
  noticeSchema,
  noticeWarning,
  type TenancyFormValues,
  tenancySchema,
} from "./tenancy";

const values = (overrides: Partial<TenancyFormValues> = {}): TenancyFormValues => ({
  firstName: " Priya ",
  lastName: "Shah",
  email: "",
  phone: "07700 900101",
  startDate: "2026-11-01",
  rent: "550",
  rentFrequency: "monthly",
  rentDueDay: "1",
  deposit: "634.61",
  ...overrides,
});

const messages = (input: TenancyFormValues) => {
  const result = tenancySchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => [issue.path[0], issue.message]);
};

describe("depositCapPence", () => {
  it("is five weeks' rent, rounded down to the penny", () => {
    expect(depositCapPence(55_000, "monthly")).toBe(63_461);
    expect(depositCapPence(13_000, "weekly")).toBe(65_000);
  });

  it("is six weeks' rent once the yearly rent reaches £50,000", () => {
    expect(depositCapPence(416_666, "monthly")).toBe(Math.floor((416_666 * 12 * 5) / 52));
    expect(depositCapPence(416_667, "monthly")).toBe(Math.floor((416_667 * 12 * 6) / 52));
  });
});

describe("tenancySchema", () => {
  it("reads the form into pence and numbers", () => {
    expect(tenancySchema.parse(values())).toEqual({
      firstName: "Priya",
      lastName: "Shah",
      email: null,
      phone: "07700 900101",
      startDate: "2026-11-01",
      rent: 55_000,
      rentFrequency: "monthly",
      rentDueDay: 1,
      deposit: 63_461,
    });
    expect(tenancySchema.parse(values({ deposit: "" })).deposit).toBe(0);
  });

  it("refuses a deposit over the legal cap and says what the cap is", () => {
    expect(messages(values({ deposit: "634.62" }))).toEqual([
      ["deposit", "The deposit can be at most £634.61 (5 weeks' rent)."],
    ]);
  });

  it("takes a weekday for weekly rent and a day of the month for monthly rent", () => {
    expect(
      messages(values({ rentFrequency: "weekly", rent: "130", rentDueDay: "5", deposit: "" })),
    ).toEqual([]);
    expect(
      messages(values({ rentFrequency: "weekly", rent: "130", rentDueDay: "8", deposit: "" })),
    ).toEqual([["rentDueDay", "Choose when rent is due"]]);
    expect(messages(values({ rentDueDay: "31" }))).toEqual([]);
    expect(messages(values({ rentDueDay: "32" }))).toEqual([
      ["rentDueDay", "Choose when rent is due"],
    ]);
  });

  it("explains what's missing", () => {
    expect(
      messages(
        values({ firstName: "", startDate: "2026-02-30", rent: "", rentFrequency: "yearly" }),
      ),
    ).toEqual([
      ["firstName", "Enter the tenant's first name"],
      ["startDate", "Enter a real date, like 31/12/2026"],
      ["rent", "Enter the rent"],
      ["rentFrequency", "Choose monthly or weekly"],
    ]);
  });
});

describe("notice", () => {
  it("needs the end date on or after the notice date", () => {
    expect(
      noticeSchema.safeParse({
        endReason: "tenant_notice",
        noticeDate: "2026-10-01",
        endDate: "2026-09-30",
      }).success,
    ).toBe(false);
  });

  it("warns, but doesn't stop, a tenant's notice of under two months", () => {
    const base = { endReason: "tenant_notice", noticeDate: "2026-10-21" };
    expect(noticeWarning({ ...base, endDate: "2026-12-20" })).toMatch(/less than two months/);
    expect(noticeWarning({ ...base, endDate: "2026-12-21" })).toBeNull();
    expect(noticeWarning({ ...base, endReason: "surrender", endDate: "2026-11-01" })).toBeNull();
  });

  it("adds months without spilling into the next month", () => {
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2027-12-31", 2)).toBe("2028-02-29");
    expect(addMonths("2026-10-21", 2)).toBe("2026-12-21");
  });
});
