CREATE TYPE "public"."tenancy_end_reason" AS ENUM('tenant_notice', 'surrender', 'possession', 'other');--> statement-breakpoint
ALTER TABLE "tenancies" ADD COLUMN "notice_date" date;--> statement-breakpoint
ALTER TABLE "tenancies" ADD COLUMN "end_reason" "tenancy_end_reason";--> statement-breakpoint
-- Since 1 May 2026 tenancies are periodic: a fixed end date on a tenancy that
-- hasn't had notice no longer means anything, so clear it (audited).
UPDATE "tenancies" SET "end_date" = NULL
WHERE "status" IN ('prospective', 'active') AND "end_date" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenancies_one_upcoming_per_room" ON "tenancies" USING btree ("room_id") WHERE status = 'prospective';--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_rent_monthly_or_weekly" CHECK (rent_frequency in ('monthly', 'weekly'));--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_weekly_due_day_is_weekday" CHECK (rent_frequency <> 'weekly' or rent_due_day between 1 and 7);--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_end_details_match_status" CHECK (case when status in ('ending', 'ended')
        then end_date is not null and end_reason is not null
        else end_date is null and end_reason is null and notice_date is null end);--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_notice_within_tenancy" CHECK (notice_date is null or (notice_date >= start_date and notice_date <= end_date));--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_deposit_within_cap" CHECK (deposit_pence <= floor(
        (rent_pence::bigint * case rent_frequency when 'weekly' then 52 when 'fortnightly' then 26
          when 'four_weekly' then 13 else 12 end)::numeric
        * case when rent_pence::bigint * case rent_frequency when 'weekly' then 52
          when 'fortnightly' then 26 when 'four_weekly' then 13 else 12 end >= 5000000
          then 6 else 5 end / 52));