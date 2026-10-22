DROP INDEX "rent_charges_one_per_period";--> statement-breakpoint
CREATE INDEX "rent_charges_schedule_period_idx" ON "rent_charges" USING btree ("tenancy_id","period_start") WHERE source = 'schedule';