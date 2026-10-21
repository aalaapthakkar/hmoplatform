import { describe, expect, it } from "vitest";
import { formatPence, formatUkDate, formatUkDateTime, todayInLondon } from "./format";

describe("formatPence", () => {
  it("formats whole pence as pounds", () => {
    expect(formatPence(12345)).toBe("£123.45");
    expect(formatPence(0)).toBe("£0.00");
    expect(formatPence(-150)).toBe("-£1.50");
  });

  it("rejects fractional pence", () => {
    expect(() => formatPence(10.5)).toThrow(TypeError);
  });
});

describe("formatUkDate", () => {
  it("uses DD/MM/YYYY", () => {
    expect(formatUkDate("2026-01-15T12:00:00Z")).toBe("15/01/2026");
  });

  it("displays the Europe/London date during British Summer Time", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London.
    expect(formatUkDate(new Date("2026-06-30T23:30:00Z"))).toBe("01/07/2026");
  });
});

describe("todayInLondon", () => {
  it("gives the London date as YYYY-MM-DD", () => {
    expect(todayInLondon(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15");
  });

  it("rolls over at midnight London time, not UTC", () => {
    expect(todayInLondon(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});

describe("formatUkDateTime", () => {
  it("shows the London date and 24-hour time", () => {
    expect(formatUkDateTime("2026-01-15T14:05:00Z")).toBe("15/01/2026 14:05");
    // 13:05 UTC is 14:05 in British Summer Time.
    expect(formatUkDateTime("2026-07-01T13:05:00Z")).toBe("01/07/2026 14:05");
  });
});
