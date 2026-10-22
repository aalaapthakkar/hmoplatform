import { boolean, index, pgEnum, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { organisations } from "./organisations";
import { users } from "./users";

export const membershipRole = pgEnum("membership_role", ["admin", "staff"]);

export const membershipStatus = pgEnum("membership_status", ["invited", "active", "removed"]);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    /** Gets the daily compliance reminder email. On for admins when they join. */
    complianceEmails: boolean("compliance_emails").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("memberships_org_id_user_id_key").on(table.orgId, table.userId),
    index("memberships_user_id_idx").on(table.userId),
  ],
).enableRLS();

export type Membership = typeof memberships.$inferSelect;
export type MembershipRole = (typeof membershipRole.enumValues)[number];
