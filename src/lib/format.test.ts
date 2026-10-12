import { describe, expect, it } from "vitest";
import { formatPence, formatUkDate } from "./format";

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
