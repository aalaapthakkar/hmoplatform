import { formatPence, formatUkDate } from "@/lib/format";
import {
  type ApplicationValues,
  EMPLOYMENT_STATUSES,
  TIME_AT_ADDRESS,
} from "@/lib/validation/application";
import { isRealDate } from "@/lib/validation/dates";
import { poundsToPence } from "@/lib/validation/property";

const LABELS: [keyof ApplicationValues, string][] = [
  ["legalName", "Full legal name"],
  ["dateOfBirth", "Date of birth"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["currentAddress", "Current address"],
  ["currentPostcode", "Postcode"],
  ["timeAtAddress", "Time at this address"],
  ["employmentStatus", "Employment"],
  ["employerOrPlace", "Employer or place of study"],
  ["annualIncome", "Yearly income"],
  ["hasGuarantor", "Guarantor"],
  ["guarantorName", "Guarantor's name"],
  ["guarantorEmail", "Guarantor's email"],
  ["emergencyName", "Emergency contact"],
  ["emergencyPhone", "Emergency contact's phone"],
  ["shareCode", "Share code"],
  ["smoker", "Smoker"],
  ["pets", "Pets"],
  ["petDetails", "About their pets"],
];

const YES_NO = { yes: "Yes", no: "No" } as Record<string, string>;

function display(key: keyof ApplicationValues, value: string): string {
  switch (key) {
    case "dateOfBirth":
      return isRealDate(value) ? formatUkDate(value) : value;
    case "annualIncome": {
      const pence = poundsToPence(value);
      return pence === null ? value : formatPence(pence);
    }
    case "timeAtAddress":
      return TIME_AT_ADDRESS[value as keyof typeof TIME_AT_ADDRESS] ?? value;
    case "employmentStatus":
      return EMPLOYMENT_STATUSES[value as keyof typeof EMPLOYMENT_STATUSES] ?? value;
    case "hasGuarantor":
    case "smoker":
    case "pets":
      return YES_NO[value] ?? value;
    case "shareCode":
      return value.replace(/(.{3})(?=.)/g, "$1 ");
    default:
      return value;
  }
}

/** The answers as labelled rows for staff, leaving out anything blank. */
export function applicationRows(values: ApplicationValues): { label: string; value: string }[] {
  return LABELS.filter(([key]) => values[key]).map(([key, label]) => ({
    label,
    value: display(key, values[key]),
  }));
}
