ALTER TABLE "rent_charges" DROP CONSTRAINT "rent_charges_void_recorded";--> statement-breakpoint
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_void_recorded";--> statement-breakpoint
DROP INDEX "rent_charges_one_per_period";--> statement-breakpoint
ALTER TABLE "rent_charges" ADD COLUMN "reverses_charge_id" uuid;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD COLUMN "reverses_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_reverses_fk" FOREIGN KEY ("reverses_charge_id","org_id") REFERENCES "public"."rent_charges"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_reverses_fk" FOREIGN KEY ("reverses_payment_id","org_id") REFERENCES "public"."rent_payments"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rent_charges_reversed_once" ON "rent_charges" USING btree ("reverses_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rent_payments_reversed_once" ON "rent_payments" USING btree ("reverses_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rent_charges_one_per_period" ON "rent_charges" USING btree ("tenancy_id","period_start","period_end") WHERE source = 'schedule' and reverses_charge_id is null;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_reversal_has_no_period" CHECK (reverses_charge_id is null or (period_start is null and period_end is null));--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_note_length" CHECK (char_length(note) <= 300);--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_reversal_has_reason" CHECK (reverses_payment_id is null or char_length(trim(note)) > 0);