CREATE TYPE "public"."link_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."rent_frequency" AS ENUM('weekly', 'fortnightly', 'four_weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."ownership_type" AS ENUM('owned', 'managed', 'master_lease');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('house', 'flat', 'maisonette', 'bungalow', 'other');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('available', 'let', 'unavailable', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tenancy_status" AS ENUM('prospective', 'active', 'ending', 'ended');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('gas_safety', 'eicr', 'epc', 'hmo_licence', 'fire_risk_assessment', 'tenancy_agreement', 'right_to_rent', 'deposit_certificate', 'inventory', 'other');--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"address_line_1" text NOT NULL,
	"address_line_2" text,
	"town" text NOT NULL,
	"postcode" text NOT NULL,
	"uprn" text,
	"council" text,
	"property_type" "property_type" DEFAULT 'house' NOT NULL,
	"ownership_type" "ownership_type" NOT NULL,
	"head_rent_pence" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "properties_postcode_format" CHECK (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'),
	CONSTRAINT "properties_uprn_format" CHECK (uprn ~ '^[0-9]{1,12}$'),
	CONSTRAINT "properties_head_rent_pence_not_negative" CHECK (head_rent_pence >= 0)
);
--> statement-breakpoint
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rent_pence" integer NOT NULL,
	"rent_frequency" "rent_frequency" DEFAULT 'monthly' NOT NULL,
	"size_sqm" numeric(6, 2),
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "room_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "rooms_rent_pence_not_negative" CHECK (rent_pence >= 0),
	CONSTRAINT "rooms_size_sqm_positive" CHECK (size_sqm > 0)
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_id_org_id_key" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "tenancy_status" DEFAULT 'prospective' NOT NULL,
	"rent_pence" integer NOT NULL,
	"rent_frequency" "rent_frequency" DEFAULT 'monthly' NOT NULL,
	"rent_due_day" smallint DEFAULT 1 NOT NULL,
	"deposit_pence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenancies_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "tenancies_dates_in_order" CHECK (end_date >= start_date),
	CONSTRAINT "tenancies_rent_pence_not_negative" CHECK (rent_pence >= 0),
	CONSTRAINT "tenancies_deposit_pence_not_negative" CHECK (deposit_pence >= 0),
	CONSTRAINT "tenancies_rent_due_day_range" CHECK (rent_due_day between 1 and 31)
);
--> statement-breakpoint
ALTER TABLE "tenancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "link_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenancy_tenants_tenancy_id_tenant_id_key" UNIQUE("tenancy_id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tenancy_tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_id_org_id_key" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "property_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "link_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_owners_property_id_owner_id_key" UNIQUE("property_id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "property_owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"expiry_date" date,
	"property_id" uuid,
	"room_id" uuid,
	"tenancy_id" uuid,
	"tenant_id" uuid,
	"owner_id" uuid,
	"uploaded_by" uuid,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_linked_to_one_record" CHECK (num_nonnulls(property_id, room_id, tenancy_id, tenant_id, owner_id) = 1),
	CONSTRAINT "documents_file_path_in_org_folder" CHECK (starts_with(file_path, org_id::text || '/'))
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_fk" FOREIGN KEY ("property_id","org_id") REFERENCES "public"."properties"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_room_fk" FOREIGN KEY ("room_id","org_id") REFERENCES "public"."rooms"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_tenants" ADD CONSTRAINT "tenancy_tenants_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_tenants" ADD CONSTRAINT "tenancy_tenants_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_tenants" ADD CONSTRAINT "tenancy_tenants_tenant_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."tenants"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_property_fk" FOREIGN KEY ("property_id","org_id") REFERENCES "public"."properties"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_owner_fk" FOREIGN KEY ("owner_id","org_id") REFERENCES "public"."owners"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_fk" FOREIGN KEY ("property_id","org_id") REFERENCES "public"."properties"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_room_fk" FOREIGN KEY ("room_id","org_id") REFERENCES "public"."rooms"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."tenants"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_fk" FOREIGN KEY ("owner_id","org_id") REFERENCES "public"."owners"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_org_id_idx" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rooms_org_id_idx" ON "rooms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rooms_property_id_idx" ON "rooms" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "tenants_org_id_idx" ON "tenants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tenancies_org_id_idx" ON "tenancies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tenancies_room_id_idx" ON "tenancies" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenancies_one_current_per_room" ON "tenancies" USING btree ("room_id") WHERE status in ('active', 'ending');--> statement-breakpoint
CREATE INDEX "tenancy_tenants_org_id_idx" ON "tenancy_tenants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tenancy_tenants_tenant_id_idx" ON "tenancy_tenants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "owners_org_id_idx" ON "owners" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "property_owners_org_id_idx" ON "property_owners" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "property_owners_owner_id_idx" ON "property_owners" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_org_id_expiry_date_idx" ON "documents" USING btree ("org_id","expiry_date");--> statement-breakpoint
CREATE INDEX "documents_property_id_idx" ON "documents" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "documents_room_id_idx" ON "documents" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "documents_tenancy_id_idx" ON "documents" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "documents_tenant_id_idx" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "documents_owner_id_idx" ON "documents" USING btree ("owner_id");