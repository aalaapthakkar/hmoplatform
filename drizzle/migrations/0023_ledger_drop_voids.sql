-- The ledger becomes append-only. Before the void columns go, each voided
-- entry becomes a reversal row: same amount, the void reason, who did it and
-- when. Nothing is lost.
INSERT INTO "rent_charges"
  (org_id, tenancy_id, kind, source, due_date, amount_pence, description,
   reverses_charge_id, created_by, created_at, updated_at)
SELECT org_id, tenancy_id, kind, 'manual', (voided_at AT TIME ZONE 'Europe/London')::date,
  amount_pence, void_reason, id, voided_by, voided_at, voided_at
FROM "rent_charges"
WHERE status = 'voided';--> statement-breakpoint
INSERT INTO "rent_payments"
  (org_id, tenancy_id, paid_on, amount_pence, method, reference, note,
   reverses_payment_id, recorded_by, created_at, updated_at)
SELECT org_id, tenancy_id, (voided_at AT TIME ZONE 'Europe/London')::date, amount_pence, method,
  reference, void_reason, id, voided_by, voided_at, voided_at
FROM "rent_payments"
WHERE status = 'voided';--> statement-breakpoint
ALTER TABLE "rent_charges" DROP CONSTRAINT "rent_charges_voided_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_voided_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "rent_charges" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "rent_charges" DROP COLUMN "void_reason";--> statement-breakpoint
ALTER TABLE "rent_charges" DROP COLUMN "voided_at";--> statement-breakpoint
ALTER TABLE "rent_charges" DROP COLUMN "voided_by";--> statement-breakpoint
ALTER TABLE "rent_payments" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "rent_payments" DROP COLUMN "void_reason";--> statement-breakpoint
ALTER TABLE "rent_payments" DROP COLUMN "voided_at";--> statement-breakpoint
ALTER TABLE "rent_payments" DROP COLUMN "voided_by";--> statement-breakpoint
DROP TYPE "public"."ledger_status";