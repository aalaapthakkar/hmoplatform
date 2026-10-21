import { z } from "zod";

/** Calendar dates are "YYYY-MM-DD" strings, as date inputs and Postgres date columns use. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Adds days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Adds calendar months to a "YYYY-MM-DD" date, keeping to the last day of a
 * shorter month: 31/12 plus two months is 28/02 (or 29/02).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

const NOT_A_DATE = "Enter a real date, like 31/12/2026";

/** A required date from a date input. */
export const dateField = (label: string) =>
  z.string().trim().min(1, `Enter the ${label}`).refine(isRealDate, NOT_A_DATE);

/** An optional date from a date input: "" becomes null. */
export const optionalDateField = z
  .string()
  .trim()
  .refine((value) => value === "" || isRealDate(value), NOT_A_DATE)
  .transform((value) => value || null);
