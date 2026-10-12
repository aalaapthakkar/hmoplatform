import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { timestamps } from "./_shared";

/**
 * Profile for each Supabase Auth user. Rows are created and kept in step by a
 * trigger on auth.users. No org_id: one person can belong to several orgs.
 */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email"),
  fullName: text("full_name"),
  ...timestamps,
}).enableRLS();

export type User = typeof users.$inferSelect;
