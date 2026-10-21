import { describe, expect, it } from "vitest";
import {
  canAddTenancy,
  defaultTenancyId,
  dueDayLabel,
  groupTenancies,
  hasSpaceForTenancy,
  statusForStart,
  type TenancyDates,
  type TenancyStatus,
  vacancyDate,
} from "./status";

const TODAY = "2026-10-21";
let next = 0;
const tenancy = (
  status: TenancyStatus,
  startDate = "2026-06-01",
  endDate: string | null = null,
): TenancyDates => ({ id: `t${++next}`, status, startDate, endDate });

describe("one active tenancy per room", () => {
  it("refuses a second current tenancy", () => {
    expect(canAddTenancy([tenancy("active")], TODAY, TODAY)).toMatchObject({
      ok: false,
      message: expect.stringContaining("already has a current tenancy"),
    });
  });

  it("counts a tenancy with notice given as current", () => {
    expect(
      canAddTenancy([tenancy("ending", "2026-06-01", "2026-12-01")], "2026-10-01", TODAY).ok,
    ).toBe(false);
  });

  it("allows one upcoming tenancy alongside the current one, but not two", () => {
    const current = tenancy("active");
    expect(canAddTenancy([current], "2026-12-01", TODAY)).toEqual({
      ok: true,
      status: "prospective",
    });
    expect(
      canAddTenancy([current, tenancy("prospective", "2026-12-01")], "2027-01-01", TODAY),
    ).toMatchObject({ ok: false, message: expect.stringContaining("upcoming tenancy") });
  });

  it("makes the next tenant wait until the current one has left", () => {
    expect(
      canAddTenancy([tenancy("ending", "2026-06-01", "2026-12-01")], "2026-11-15", TODAY),
    ).toMatchObject({ ok: false, message: expect.stringContaining("ends on 01/12/2026") });
    expect(
      canAddTenancy([tenancy("ending", "2026-06-01", "2026-12-01")], "2026-12-01", TODAY).ok,
    ).toBe(true);
  });

  it("ignores past and cancelled tenancies", () => {
    expect(
      canAddTenancy([tenancy("ended"), tenancy("ended"), tenancy("cancelled")], TODAY, TODAY),
    ).toEqual({ ok: true, status: "active" });
  });
});

describe("statuses and dates", () => {
  it("makes future tenancies upcoming and the rest current", () => {
    expect(statusForStart("2026-10-22", TODAY)).toBe("prospective");
    expect(statusForStart(TODAY, TODAY)).toBe("active");
    expect(statusForStart("2025-01-01", TODAY)).toBe("active");
  });

  it("groups a room's tenancies, newest past ones first", () => {
    const older = tenancy("ended", "2024-09-01");
    const newer = tenancy("cancelled", "2025-09-01");
    const current = tenancy("active");
    const upcoming = tenancy("prospective", "2027-01-01");
    expect(groupTenancies([older, upcoming, newer, current])).toEqual({
      current,
      upcoming,
      past: [newer, older],
    });
  });

  it("shows the current tenancy first, then upcoming, then the latest past one", () => {
    const past = tenancy("ended", "2025-01-01");
    const upcoming = tenancy("prospective", "2027-01-01");
    const current = tenancy("active");
    expect(defaultTenancyId([past, upcoming, current])).toBe(current.id);
    expect(defaultTenancyId([past, upcoming])).toBe(upcoming.id);
    expect(defaultTenancyId([past])).toBe(past.id);
    expect(defaultTenancyId([])).toBeNull();
  });

  it("knows when a room is free", () => {
    expect(vacancyDate([])).toBe("now");
    expect(vacancyDate([tenancy("ended")])).toBe("now");
    expect(vacancyDate([tenancy("active")])).toBeNull();
    expect(vacancyDate([tenancy("ending", "2026-06-01", "2026-12-01")])).toBe("2026-12-01");
  });

  it("offers Add tenancy until an upcoming one is lined up", () => {
    expect(hasSpaceForTenancy([tenancy("active")])).toBe(true);
    expect(hasSpaceForTenancy([tenancy("active"), tenancy("prospective")])).toBe(false);
  });

  it("describes when rent is due", () => {
    expect(dueDayLabel("monthly", 1)).toBe("1st of the month");
    expect(dueDayLabel("monthly", 22)).toBe("22nd of the month");
    expect(dueDayLabel("monthly", 13)).toBe("13th of the month");
    expect(dueDayLabel("monthly", 31)).toBe("31st of the month (or the last day)");
    expect(dueDayLabel("weekly", 1)).toBe("Mondays");
    expect(dueDayLabel("weekly", 7)).toBe("Sundays");
  });
});
