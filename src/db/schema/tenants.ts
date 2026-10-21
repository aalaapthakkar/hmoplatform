import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { users } from "./users";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    /** Their tenant portal login, once they've accepted an invite. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("tenants_id_org_id_key").on(table.id, table.orgId),
    index("tenants_org_id_idx").on(table.orgId),
    index("tenants_user_id_idx").on(table.userId),
  ],
).enableRLS();

export type Tenant = typeof tenants.$inferSelect;
