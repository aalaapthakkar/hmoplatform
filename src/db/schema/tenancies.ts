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

export const tenancyStatus = pgEnum("tenancy_status", [
  "prospective",
  "active",
  "ending",
  "ended",
  "cancelled",
]);

/** How a tenancy came to an end. */
export const tenancyEndReason = pgEnum("tenancy_end_reason", [
  "tenant_notice",
  "surrender",
  "possession",
  "other",
]);

export const tenancies = pgTable(
  "tenancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    roomId: uuid("room_id").notNull(),
    /** Calendar dates (no time zone), as written on the tenancy agreement. */
    startDate: date("start_date").notNull(),
    /**
     * Tenancies in England are periodic since 1 May 2026, so there's no end
     * date until notice is recorded (status ending, then ended).
     */
    endDate: date("end_date"),
    noticeDate: date("notice_date"),
    endReason: tenancyEndReason("end_reason"),
    status: tenancyStatus("status").notNull().default("prospective"),
    rentPence: integer("rent_pence").notNull(),
    rentFrequency: rentFrequency("rent_frequency").notNull().default("monthly"),
    /** Day of the month (1-31) for monthly rent, or of the week (1 = Monday) for weekly rent. */
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
    // And at most one upcoming tenancy, so the next tenant is never ambiguous.
    uniqueIndex("tenancies_one_upcoming_per_room")
      .on(table.roomId)
      .where(sql`status = 'prospective'`),
    foreignKey({
      name: "tenancies_room_fk",
      columns: [table.roomId, table.orgId],
      foreignColumns: [rooms.id, rooms.orgId],
    }).onDelete("restrict"),
    check("tenancies_dates_in_order", sql`end_date >= start_date`),
    check("tenancies_rent_pence_not_negative", sql`rent_pence >= 0`),
    check("tenancies_deposit_pence_not_negative", sql`deposit_pence >= 0`),
    check("tenancies_rent_due_day_range", sql`rent_due_day between 1 and 31`),
    check("tenancies_rent_monthly_or_weekly", sql`rent_frequency in ('monthly', 'weekly')`),
    check(
      "tenancies_weekly_due_day_is_weekday",
      sql`rent_frequency <> 'weekly' or rent_due_day between 1 and 7`,
    ),
    // Notice, end date and reason belong to tenancies that are ending or ended.
    check(
      "tenancies_end_details_match_status",
      sql`case when status in ('ending', 'ended')
        then end_date is not null and end_reason is not null
        else end_date is null and end_reason is null and notice_date is null end`,
    ),
    check(
      "tenancies_notice_within_tenancy",
      sql`notice_date is null or (notice_date >= start_date and notice_date <= end_date)`,
    ),
    // Tenant Fees Act 2019: at most 5 weeks' rent, or 6 if the yearly rent is £50,000 or more.
    check(
      "tenancies_deposit_within_cap",
      sql`deposit_pence <= floor(
        (rent_pence::bigint * case rent_frequency when 'weekly' then 52 when 'fortnightly' then 26
          when 'four_weekly' then 13 else 12 end)::numeric
        * case when rent_pence::bigint * case rent_frequency when 'weekly' then 52
          when 'fortnightly' then 26 when 'four_weekly' then 13 else 12 end >= 5000000
          then 6 else 5 end / 52)`,
    ),
  ],
).enableRLS();

export type Tenancy = typeof tenancies.$inferSelect;
export type TenancyStatus = (typeof tenancyStatus.enumValues)[number];
export type TenancyEndReason = (typeof tenancyEndReason.enumValues)[number];
