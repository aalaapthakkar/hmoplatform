const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const ukDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const isoDateInLondon = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Formats an integer amount of pence as pounds, e.g. 12345 -> "£123.45". */
export function formatPence(pence: number): string {
  if (!Number.isSafeInteger(pence)) {
    throw new TypeError("Money must be a whole number of pence");
  }
  return gbp.format(pence / 100);
}

/** Formats a UTC instant as a UK date (DD/MM/YYYY) in Europe/London time. */
export function formatUkDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("Invalid date");
  }
  return ukDate.format(value);
}

/** Today's date in Europe/London as "YYYY-MM-DD", for comparing with date columns. */
export function todayInLondon(now: Date = new Date()): string {
  return isoDateInLondon.format(now);
}
