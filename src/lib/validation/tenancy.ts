import { z } from "zod";
import { formatPence } from "@/lib/format";
import { addMonths, dateField } from "./dates";
import { optionalPoundsField, optionalText, poundsField } from "./property";

export const TENANCY_FREQUENCIES = ["monthly", "weekly"] as const;
export type TenancyFrequency = (typeof TENANCY_FREQUENCIES)[number];

export const END_REASONS = ["tenant_notice", "surrender", "possession", "other"] as const;
export type EndReason = (typeof END_REASONS)[number];

export const END_REASON_LABELS: Record<EndReason, string> = {
  tenant_notice: "The tenant gave notice",
  surrender: "Ending early by agreement",
  possession: "Possession order (landlord)",
  other: "Something else",
};

/**
 * The most a deposit can be under the Tenant Fees Act 2019: 5 weeks' rent,
 * or 6 weeks' if the yearly rent is £50,000 or more. Whole pence, rounded down.
 * Matches the tenancies_deposit_within_cap check in the database.
 */
export function depositCapPence(rentPence: number, frequency: TenancyFrequency): number {
  const yearly = rentPence * (frequency === "weekly" ? 52 : 12);
  const weeks = yearly >= 5_000_000 ? 6 : 5;
  return Math.floor((yearly * weeks) / 52);
}

export function depositCapLabel(rentPence: number, frequency: TenancyFrequency): string {
  const yearly = rentPence * (frequency === "weekly" ? 52 : 12);
  return `${formatPence(depositCapPence(rentPence, frequency))} (${yearly >= 5_000_000 ? 6 : 5} weeks' rent)`;
}

export type TenancyFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  startDate: string;
  rent: string;
  rentFrequency: string;
  rentDueDay: string;
  deposit: string;
};

export const tenancySchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter the tenant's first name").max(60),
    lastName: z.string().trim().min(1, "Enter the tenant's last name").max(60),
    email: z
      .string()
      .trim()
      .max(254)
      .transform((value) => value || null)
      .pipe(z.email("Enter a valid email address").nullable()),
    phone: optionalText(30, "Use 30 characters or fewer"),
    startDate: dateField("start date"),
    rent: poundsField("rent"),
    rentFrequency: z.enum(TENANCY_FREQUENCIES, "Choose monthly or weekly"),
    rentDueDay: z
      .string()
      .regex(/^\d{1,2}$/, "Choose when rent is due")
      .transform(Number),
    deposit: optionalPoundsField.transform((pence) => pence ?? 0),
  })
  .superRefine((tenancy, ctx) => {
    const weekly = tenancy.rentFrequency === "weekly";
    if (tenancy.rentDueDay < 1 || tenancy.rentDueDay > (weekly ? 7 : 31)) {
      ctx.addIssue({ code: "custom", path: ["rentDueDay"], message: "Choose when rent is due" });
    }
    if (
      tenancy.rent > 0 &&
      tenancy.deposit > depositCapPence(tenancy.rent, tenancy.rentFrequency)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["deposit"],
        message: `The deposit can be at most ${depositCapLabel(tenancy.rent, tenancy.rentFrequency)}.`,
      });
    }
  });

export type TenancyInput = z.infer<typeof tenancySchema>;

export type NoticeFormValues = { endReason: string; noticeDate: string; endDate: string };

export const noticeSchema = z
  .object({
    endReason: z.enum(END_REASONS, "Choose how the tenancy is ending"),
    noticeDate: dateField("date notice was given"),
    endDate: dateField("last day of the tenancy"),
  })
  .refine((notice) => notice.noticeDate <= notice.endDate, {
    path: ["endDate"],
    message: "The end date can't be before the notice date",
  });

/**
 * A gentle warning, not a rule: a tenant's notice is normally at least two
 * months, but an earlier end can be agreed.
 */
export function noticeWarning(values: NoticeFormValues): string | null {
  if (values.endReason !== "tenant_notice" || !values.noticeDate || !values.endDate) return null;
  if (values.endDate >= addMonths(values.noticeDate, 2)) return null;
  return "That's less than two months' notice. Tenants normally have to give at least two months, unless you've agreed an earlier end.";
}
