import { pgEnum } from "drizzle-orm/pg-core";

/** Soft status for records that are retired rather than deleted. */
export const recordStatus = pgEnum("record_status", ["active", "archived"]);

/** Soft status for links between records (join tables). */
export const linkStatus = pgEnum("link_status", ["active", "removed"]);

export const rentFrequency = pgEnum("rent_frequency", [
  "weekly",
  "fortnightly",
  "four_weekly",
  "monthly",
]);

export type RecordStatus = (typeof recordStatus.enumValues)[number];
export type LinkStatus = (typeof linkStatus.enumValues)[number];
export type RentFrequency = (typeof rentFrequency.enumValues)[number];
