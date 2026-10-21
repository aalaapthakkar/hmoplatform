CREATE TYPE "public"."letting_type" AS ENUM('house_share', 'single_let');--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "rent_pence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "letting_type" "letting_type" DEFAULT 'house_share' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bedrooms" smallint;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_master_lease_has_head_rent" CHECK (ownership_type <> 'master_lease' or head_rent_pence is not null);--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_bedrooms_range" CHECK (bedrooms between 1 and 50);