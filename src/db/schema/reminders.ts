import {
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { tenants } from "./tenants";
import { users } from "./users";

export const reminderKind = pgEnum("reminder_kind", ["right_to_rent_follow_up", "other"]);
export const reminderStatus = pgEnum("reminder_status", ["open", "done", "dismissed"]);

/** Something to do by a date, such as a right to rent follow-up check. */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    kind: reminderKind("kind").notNull(),
    title: text("title").notNull(),
    dueDate: date("due_date").notNull(),
    status: reminderStatus("status").notNull().default("open"),
    tenantId: uuid("tenant_id"),
    /** The record that created it, e.g. a right to rent check. */
    sourceId: uuid("source_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("reminders_id_org_id_key").on(table.id, table.orgId),
    index("reminders_org_id_due_date_idx").on(table.orgId, table.dueDate),
    foreignKey({
      name: "reminders_tenant_fk",
      columns: [table.tenantId, table.orgId],
      foreignColumns: [tenants.id, tenants.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();

export type Reminder = typeof reminders.$inferSelect;
