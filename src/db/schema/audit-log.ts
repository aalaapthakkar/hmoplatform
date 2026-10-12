import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const auditAction = pgEnum("audit_action", ["insert", "update", "delete"]);

/**
 * Append-only change history, written by database triggers. No client can
 * insert, update or delete rows. actor_user_id has no foreign key so history
 * survives if a user account is removed.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id"),
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: auditAction("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_org_id_created_at_idx").on(table.orgId, table.createdAt)],
).enableRLS();

export type AuditLogEntry = typeof auditLog.$inferSelect;
