ALTER TABLE "properties" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "amenities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "house_rules" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bills_included" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_description_length" CHECK (char_length(description) <= 5000);--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_house_rules_length" CHECK (char_length(house_rules) <= 5000);