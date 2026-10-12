import { pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: organisationStatus("status").notNull().default("active"),
  ...timestamps,
}).enableRLS();

export type Organisation = typeof organisations.$inferSelect;
