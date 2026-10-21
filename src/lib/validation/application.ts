import { z } from "zod";
import { todayInLondon } from "@/lib/format";
import { addMonths, isRealDate } from "./dates";
import { isValidPostcode, normalisePostcode, poundsToPence } from "./property";

/**
 * The applicant's answers. Kept as the strings the form uses, both for
 * drafts and once submitted, so staff see exactly what was entered.
 */
export type ApplicationValues = {
  legalName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  currentAddress: string;
  currentPostcode: string;
  timeAtAddress: string;
  employmentStatus: string;
  employerOrPlace: string;
  annualIncome: string;
  hasGuarantor: string;
  guarantorName: string;
  guarantorEmail: string;
  emergencyName: string;
  emergencyPhone: string;
  shareCode: string;
  smoker: string;
  pets: string;
  petDetails: string;
  consent: string;
};

export const EMPTY_APPLICATION: ApplicationValues = {
  legalName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  currentAddress: "",
  currentPostcode: "",
  timeAtAddress: "",
  employmentStatus: "",
  employerOrPlace: "",
  annualIncome: "",
  hasGuarantor: "",
  guarantorName: "",
  guarantorEmail: "",
  emergencyName: "",
  emergencyPhone: "",
  shareCode: "",
  smoker: "",
  pets: "",
  petDetails: "",
  consent: "",
};

export const TIME_AT_ADDRESS = {
  under_1: "Less than a year",
  "1_to_3": "1 to 3 years",
  over_3: "More than 3 years",
} as const;

export const EMPLOYMENT_STATUSES = {
  employed: "Employed",
  self_employed: "Self-employed",
  student: "Student",
  not_working: "Not working",
  retired: "Retired",
} as const;

/** Home Office share codes are 9 letters and numbers, often written in groups of three. */
export function normaliseShareCode(value: string) {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

const KEYS = Object.keys(EMPTY_APPLICATION) as (keyof ApplicationValues)[];

/** Every answer as tidy text of sensible length, with known keys only. */
const answers = (onInvalid?: "blank") =>
  z.object(
    Object.fromEntries(
      KEYS.map((key) => {
        const field = z.string().trim().max(500, "Use 500 characters or fewer");
        return [key, onInvalid ? field.catch("") : field];
      }),
    ) as unknown as Record<keyof ApplicationValues, z.ZodType<string>>,
  );

/** A draft can be saved at any point. */
export const applicationDraftSchema = answers("blank");

const LIMITS: Partial<Record<keyof ApplicationValues, number>> = {
  phone: 30,
  emergencyPhone: 30,
  legalName: 200,
  employerOrPlace: 200,
  guarantorName: 200,
  emergencyName: 200,
  guarantorEmail: 254,
  email: 254,
  petDetails: 300,
  currentAddress: 300,
};

function ageOn(dateOfBirth: string, today: string) {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const isEmail = (value: string) => z.email().safeParse(value).success;

/**
 * Everything needed to submit, checked in one pass so the applicant sees
 * every problem at once. Conditional answers are required only when they apply.
 */
export const applicationSchema = answers()
  .superRefine((a, ctx) => {
    const issue = (path: keyof ApplicationValues, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const required: [keyof ApplicationValues, string][] = [
      ["legalName", "Enter your full legal name"],
      ["phone", "Enter your phone number"],
      ["currentAddress", "Enter your current address"],
      ["emergencyName", "Enter an emergency contact's name"],
      ["emergencyPhone", "Enter an emergency contact's phone number"],
    ];

    for (const [key, message] of required) if (!a[key]) issue(key, message);
    for (const [key, max] of Object.entries(LIMITS) as [keyof ApplicationValues, number][]) {
      if (a[key].length > max) issue(key, `Use ${max} characters or fewer`);
    }

    if (!a.dateOfBirth) issue("dateOfBirth", "Enter your date of birth");
    else if (!isRealDate(a.dateOfBirth)) issue("dateOfBirth", "Enter a real date, like 31/12/2000");
    else if (ageOn(a.dateOfBirth, todayInLondon()) < 18) {
      issue("dateOfBirth", "You need to be 18 or over to rent a room");
    }
    if (!isEmail(a.email)) issue("email", "Enter a valid email address");
    if (!a.currentPostcode) issue("currentPostcode", "Enter your current postcode");
    else if (!isValidPostcode(a.currentPostcode)) {
      issue("currentPostcode", "Enter a full UK postcode, like M14 6PZ");
    }
    if (!Object.hasOwn(TIME_AT_ADDRESS, a.timeAtAddress)) {
      issue("timeAtAddress", "Choose how long you've lived there");
    }
    if (!Object.hasOwn(EMPLOYMENT_STATUSES, a.employmentStatus)) {
      issue("employmentStatus", "Choose your employment status");
    }

    const working = a.employmentStatus === "employed" || a.employmentStatus === "self_employed";
    if ((working || a.employmentStatus === "student") && !a.employerOrPlace) {
      issue(
        "employerOrPlace",
        a.employmentStatus === "student"
          ? "Enter where you study"
          : "Enter your employer or business",
      );
    }
    if (working && poundsToPence(a.annualIncome) === null) {
      issue("annualIncome", "Enter your yearly income before tax, like 28000");
    } else if (!working && a.annualIncome && poundsToPence(a.annualIncome) === null) {
      issue("annualIncome", "Enter an amount in pounds, like 28000");
    }

    for (const [key, message] of [
      ["hasGuarantor", "Tell us whether you have a guarantor"],
      ["smoker", "Tell us whether you smoke"],
      ["pets", "Tell us whether you have pets"],
    ] as const) {
      if (a[key] !== "yes" && a[key] !== "no") issue(key, message);
    }
    if (a.hasGuarantor === "yes") {
      if (!a.guarantorName) issue("guarantorName", "Enter your guarantor's name");
      if (!isEmail(a.guarantorEmail))
        issue("guarantorEmail", "Enter your guarantor's email address");
    }
    if (a.pets === "yes" && !a.petDetails) issue("petDetails", "Tell us about your pets");
    if (a.shareCode && !/^[A-Z0-9]{9}$/.test(normaliseShareCode(a.shareCode))) {
      issue("shareCode", "A share code has 9 letters and numbers, like W2X 4Y7 Z9A");
    }
    if (a.consent !== "yes") issue("consent", "Tick the box to agree before sending");
  })
  .transform((a) => ({
    ...a,
    currentPostcode: normalisePostcode(a.currentPostcode),
    shareCode: a.shareCode ? normaliseShareCode(a.shareCode) : "",
    guarantorName: a.hasGuarantor === "yes" ? a.guarantorName : "",
    guarantorEmail: a.hasGuarantor === "yes" ? a.guarantorEmail : "",
    petDetails: a.pets === "yes" ? a.petDetails : "",
  }));

/** Reads stored answers back into form values, ignoring anything unexpected. */
export function applicationFromJson(json: unknown): ApplicationValues {
  const source = json && typeof json === "object" && !Array.isArray(json) ? json : {};
  const values = { ...EMPTY_APPLICATION };
  for (const key of Object.keys(values) as (keyof ApplicationValues)[]) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/** The latest date of birth that makes someone 18 today, for the date picker. */
export function latestAdultBirthDate(today = todayInLondon()) {
  return addMonths(today, -18 * 12);
}
