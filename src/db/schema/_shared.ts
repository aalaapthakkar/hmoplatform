import { timestamp } from "drizzle-orm/pg-core";

/** created_at / updated_at, stored as UTC timestamptz. updated_at is maintained by a trigger. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
