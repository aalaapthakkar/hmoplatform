import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";

/** Landlords whose properties the org manages or leases. A person or a company. */
export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("owners_id_org_id_key").on(table.id, table.orgId),
    index("owners_org_id_idx").on(table.orgId),
  ],
).enableRLS();

export type Owner = typeof owners.$inferSelect;
