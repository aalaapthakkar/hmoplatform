import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { onboardings } from "./onboarding";
import { tenants } from "./tenants";
import { users } from "./users";

export const rightToRentMethod = pgEnum("right_to_rent_method", [
  "manual_documents",
  "online_share_code",
  "idsp",
]);

export const rightToRentPermission = pgEnum("right_to_rent_permission", [
  "unlimited",
  "time_limited",
]);

/**
 * A right to rent check (England). Time-limited permission has an expiry
 * date, and recording it creates a follow-up reminder.
 */
export const rightToRentChecks = pgTable(
  "right_to_rent_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenantId: uuid("tenant_id").notNull(),
    onboardingId: uuid("onboarding_id"),
    checkDate: date("check_date").notNull(),
    method: rightToRentMethod("method").notNull(),
    permission: rightToRentPermission("permission").notNull(),
    expiryDate: date("expiry_date"),
    notes: text("notes"),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("right_to_rent_checks_id_org_id_key").on(table.id, table.orgId),
    index("right_to_rent_checks_org_id_idx").on(table.orgId),
    index("right_to_rent_checks_tenant_id_idx").on(table.tenantId),
    foreignKey({
      name: "right_to_rent_checks_tenant_fk",
      columns: [table.tenantId, table.orgId],
      foreignColumns: [tenants.id, tenants.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "right_to_rent_checks_onboarding_fk",
      columns: [table.onboardingId, table.orgId],
      foreignColumns: [onboardings.id, onboardings.orgId],
    }).onDelete("restrict"),
    check(
      "right_to_rent_checks_expiry_for_time_limited",
      sql`(permission = 'time_limited') = (expiry_date is not null)`,
    ),
    check("right_to_rent_checks_expiry_after_check", sql`expiry_date > check_date`),
    check("right_to_rent_checks_notes_length", sql`char_length(notes) <= 2000`),
  ],
).enableRLS();

export type RightToRentCheck = typeof rightToRentChecks.$inferSelect;
