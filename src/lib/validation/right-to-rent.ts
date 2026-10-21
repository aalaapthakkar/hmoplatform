import { z } from "zod";
import { todayInLondon } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { addDays, dateField, optionalDateField } from "./dates";

type Method = Database["public"]["Enums"]["right_to_rent_method"];
type Permission = Database["public"]["Enums"]["right_to_rent_permission"];

export const RIGHT_TO_RENT_METHODS: Record<Method, string> = {
  manual_documents: "Checked original documents in person",
  online_share_code: "Home Office online check (share code)",
  idsp: "Identity service provider (digital ID check)",
};

export const RIGHT_TO_RENT_PERMISSIONS: Record<Permission, string> = {
  unlimited: "Unlimited right to rent",
  time_limited: "Time-limited permission",
};

/** Days before time-limited permission ends that the follow-up reminder falls due. */
export const FOLLOW_UP_DAYS_BEFORE = 28;

/** Matches record_right_to_rent in the database. */
export function followUpDate(expiryDate: string) {
  return addDays(expiryDate, -FOLLOW_UP_DAYS_BEFORE);
}

export type RightToRentFormValues = {
  checkDate: string;
  method: string;
  permission: string;
  expiryDate: string;
  notes: string;
};

export const rightToRentSchema = z
  .object({
    checkDate: dateField("date of the check"),
    method: z.enum(
      Object.keys(RIGHT_TO_RENT_METHODS) as [Method, ...Method[]],
      "Choose how you checked",
    ),
    permission: z.enum(
      Object.keys(RIGHT_TO_RENT_PERMISSIONS) as [Permission, ...Permission[]],
      "Choose the result of the check",
    ),
    expiryDate: optionalDateField,
    notes: z
      .string()
      .trim()
      .max(2000, "Use 2,000 characters or fewer")
      .transform((value) => value || null),
  })
  .superRefine((check, ctx) => {
    if (check.checkDate > todayInLondon()) {
      ctx.addIssue({
        code: "custom",
        path: ["checkDate"],
        message: "The check date can't be in the future",
      });
    }
    if (check.permission === "time_limited") {
      if (!check.expiryDate) {
        ctx.addIssue({
          code: "custom",
          path: ["expiryDate"],
          message: "Enter the date their permission ends",
        });
      } else if (check.expiryDate <= check.checkDate) {
        ctx.addIssue({
          code: "custom",
          path: ["expiryDate"],
          message: "The permission must end after the check date",
        });
      }
    }
  })
  .transform((check) => ({
    ...check,
    expiryDate: check.permission === "time_limited" ? check.expiryDate : null,
  }));
