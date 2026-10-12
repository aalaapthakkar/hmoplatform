import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { rentFrequency } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { rooms } from "./rooms";

export const tenancyStatus = pgEnum("tenancy_status", ["prospective", "active", "ending", "ended"]);

export const tenancies = pgTable(
  "tenancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    roomId: uuid("room_id").notNull(),
    /** Calendar dates (no time zone), as written on the tenancy agreement. */
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: tenancyStatus("status").notNull().default("prospective"),
    rentPence: integer("rent_pence").notNull(),
    rentFrequency: rentFrequency("rent_frequency").notNull().default("monthly"),
    /** Day of the month rent is due, for monthly rent. */
    rentDueDay: smallint("rent_due_day").notNull().default(1),
    depositPence: integer("deposit_pence").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    unique("tenancies_id_org_id_key").on(table.id, table.orgId),
    index("tenancies_org_id_idx").on(table.orgId),
    index("tenancies_room_id_idx").on(table.roomId),
    // A room has at most one current tenancy. Prospective ones can overlap.
    uniqueIndex("tenancies_one_current_per_room")
      .on(table.roomId)
      .where(sql`status in ('active', 'ending')`),
    foreignKey({
      name: "tenancies_room_fk",
      columns: [table.roomId, table.orgId],
      foreignColumns: [rooms.id, rooms.orgId],
    }).onDelete("restrict"),
    check("tenancies_dates_in_order", sql`end_date >= start_date`),
    check("tenancies_rent_pence_not_negative", sql`rent_pence >= 0`),
    check("tenancies_deposit_pence_not_negative", sql`deposit_pence >= 0`),
    check("tenancies_rent_due_day_range", sql`rent_due_day between 1 and 31`),
  ],
).enableRLS();

export type Tenancy = typeof tenancies.$inferSelect;
export type TenancyStatus = (typeof tenancyStatus.enumValues)[number];
