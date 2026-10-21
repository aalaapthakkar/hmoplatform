import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { todayInLondon } from "@/lib/format";
import { addMonths } from "@/lib/validation/dates";
import {
  applicationDraftSchema,
  applicationFromJson,
  applicationSchema,
  type ApplicationValues,
  EMPTY_APPLICATION,
} from "@/lib/validation/application";
import { followUpDate, rightToRentSchema } from "@/lib/validation/right-to-rent";
import { createPortalToken, hashPortalToken, looksLikePortalToken } from "./portal-token";
import {
  applicantStepLabel,
  currentStep,
  daysStuck,
  isOverdue,
  progress,
  type StepLike,
} from "./steps";

const TODAY = "2026-10-21";

describe("steps", () => {
  const step = (
    position: number,
    status: StepLike["status"],
    extra: Partial<StepLike> = {},
  ): StepLike => ({
    position,
    status,
    dueDate: null,
    completedAt: null,
    ...extra,
  });

  it("finds the first step that isn't done or skipped", () => {
    expect(
      currentStep([step(2, "not_started"), step(1, "done"), step(3, "in_progress")])?.position,
    ).toBe(2);
    expect(currentStep([step(1, "done"), step(2, "skipped")])).toBeNull();
  });

  it("flags steps past their due date", () => {
    expect(isOverdue({ status: "in_progress", dueDate: "2026-10-20" }, TODAY)).toBe(true);
    expect(isOverdue({ status: "in_progress", dueDate: TODAY }, TODAY)).toBe(false);
    expect(isOverdue({ status: "done", dueDate: "2026-01-01" }, TODAY)).toBe(false);
  });

  it("counts days stuck from when the previous step finished, or from the start", () => {
    const toDate = (instant: string) => instant.slice(0, 10);
    expect(
      daysStuck(
        [step(1, "done", { completedAt: "2026-10-15T09:00:00Z" }), step(2, "in_progress")],
        "2026-10-01",
        TODAY,
        toDate,
      ),
    ).toBe(6);
    expect(daysStuck([step(1, "not_started")], "2026-10-01", TODAY, toDate)).toBe(20);
    expect(daysStuck([step(1, "done")], "2026-10-01", TODAY, toDate)).toBe(0);
  });

  it("measures progress and words steps for the applicant", () => {
    expect(progress([step(1, "done"), step(2, "skipped"), step(3, "not_started")])).toEqual({
      done: 2,
      total: 3,
    });
    expect(applicantStepLabel("not_started", true)).toBe("Your turn");
    expect(applicantStepLabel("not_started", false)).toBe("Coming up");
    expect(applicantStepLabel("done", false)).toBe("Done");
  });
});

describe("portal tokens", () => {
  it("are 256-bit, URL-safe, and stored only as a SHA-256 hash", () => {
    const { token, hash } = createPortalToken();
    expect(looksLikePortalToken(token)).toBe(true);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashPortalToken(token)).toBe(hash);
    expect(createPortalToken().token).not.toBe(token);
  });
});

describe("application", () => {
  const complete = (overrides: Partial<ApplicationValues> = {}): ApplicationValues => ({
    ...EMPTY_APPLICATION,
    legalName: "Ava Applicant",
    dateOfBirth: "2000-05-01",
    email: "ava@example.com",
    phone: "07700 900123",
    currentAddress: "3 Old Street, Leeds",
    currentPostcode: "ls6 1aa",
    timeAtAddress: "1_to_3",
    employmentStatus: "employed",
    employerOrPlace: "Acme Ltd",
    annualIncome: "28,000",
    hasGuarantor: "no",
    emergencyName: "Sam Applicant",
    emergencyPhone: "07700 900456",
    shareCode: "w2x 4y7 z9a",
    smoker: "no",
    pets: "no",
    consent: "yes",
    ...overrides,
  });

  const errors = (values: ApplicationValues) => {
    const result = applicationSchema.safeParse(values);
    return result.success
      ? {}
      : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
  };

  it("accepts a complete application and tidies postcode and share code", () => {
    expect(applicationSchema.parse(complete())).toMatchObject({
      currentPostcode: "LS6 1AA",
      shareCode: "W2X4Y7Z9A",
    });
  });

  it("asks only for what applies", () => {
    expect(
      errors(complete({ employmentStatus: "student", employerOrPlace: "", annualIncome: "" })),
    ).toEqual({
      employerOrPlace: "Enter where you study",
    });
    expect(
      errors(complete({ employmentStatus: "retired", employerOrPlace: "", annualIncome: "" })),
    ).toEqual({});
    expect(errors(complete({ hasGuarantor: "yes" }))).toEqual({
      guarantorName: "Enter your guarantor's name",
      guarantorEmail: "Enter your guarantor's email address",
    });
    expect(errors(complete({ pets: "yes" }))).toEqual({ petDetails: "Tell us about your pets" });
  });

  it("needs applicants to be 18 and to agree before sending", () => {
    const seventeen = addMonths(todayInLondon(), -17 * 12);
    expect(errors(complete({ dateOfBirth: seventeen, consent: "" }))).toEqual({
      dateOfBirth: "You need to be 18 or over to rent a room",
      consent: "Tick the box to agree before sending",
    });
  });

  it("doesn't accept built-in names as answers", () => {
    expect(
      errors(complete({ employmentStatus: "constructor", timeAtAddress: "toString" })),
    ).toEqual({
      timeAtAddress: "Choose how long you've lived there",
      employmentStatus: "Choose your employment status",
    });
  });

  it("checks the postcode, income and share code", () => {
    expect(
      errors(complete({ currentPostcode: "LS6", annualIncome: "lots", shareCode: "ABC" })),
    ).toEqual({
      currentPostcode: "Enter a full UK postcode, like M14 6PZ",
      annualIncome: "Enter your yearly income before tax, like 28000",
      shareCode: "A share code has 9 letters and numbers, like W2X 4Y7 Z9A",
    });
  });

  it("saves drafts loosely and reads stored answers back safely", () => {
    expect(applicationDraftSchema.parse({ legalName: "  Ava  ", extra: "ignored" })).toEqual({
      ...EMPTY_APPLICATION,
      legalName: "Ava",
    });
    expect(applicationFromJson({ legalName: "Ava", pets: 3, other: "x" })).toEqual({
      ...EMPTY_APPLICATION,
      legalName: "Ava",
    });
    expect(applicationFromJson(null)).toEqual(EMPTY_APPLICATION);
  });
});

describe("right to rent", () => {
  const values = {
    checkDate: TODAY,
    method: "online_share_code",
    permission: "time_limited",
    expiryDate: "2027-06-30",
    notes: "",
  };

  it("needs an expiry date after the check for time-limited permission", () => {
    expect(rightToRentSchema.safeParse({ ...values, expiryDate: "" }).success).toBe(false);
    expect(rightToRentSchema.safeParse({ ...values, expiryDate: TODAY }).success).toBe(false);
    expect(rightToRentSchema.parse({ ...values, checkDate: "2026-10-01" }).expiryDate).toBe(
      "2027-06-30",
    );
  });

  it("drops the expiry date for unlimited permission and refuses future checks", () => {
    expect(
      rightToRentSchema.parse({ ...values, checkDate: "2026-10-01", permission: "unlimited" })
        .expiryDate,
    ).toBeNull();
    expect(rightToRentSchema.safeParse({ ...values, checkDate: "2999-01-01" }).success).toBe(false);
  });

  it("reminds four weeks before permission ends", () => {
    expect(followUpDate("2027-06-30")).toBe("2027-06-02");
  });
});
