CREATE TYPE "public"."ledger_status" AS ENUM('active', 'voided');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('reported', 'in_progress', 'done', 'closed');--> statement-breakpoint
CREATE TYPE "public"."maintenance_urgency" AS ENUM('low', 'normal', 'urgent', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('tenant', 'staff');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'standing_order', 'card', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."rent_charge_kind" AS ENUM('rent', 'other');--> statement-breakpoint
CREATE TYPE "public"."rent_charge_source" AS ENUM('schedule', 'manual');--> statement-breakpoint
CREATE TYPE "public"."service_method" AS ENUM('portal', 'email', 'post', 'by_hand');--> statement-breakpoint
CREATE TABLE "document_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"served_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" "service_method" DEFAULT 'portal' NOT NULL,
	"served_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_services_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "document_services_document_tenancy_key" UNIQUE("document_id","tenancy_id")
);
--> statement-breakpoint
ALTER TABLE "document_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenance_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_photos_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "maintenance_photos_path_in_request_folder" CHECK (starts_with(file_path, org_id::text || '/maintenance/' || request_id::text || '/'))
);
--> statement-breakpoint
ALTER TABLE "maintenance_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid,
	"tenancy_id" uuid,
	"reported_by" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"urgency" "maintenance_urgency" DEFAULT 'normal' NOT NULL,
	"status" "maintenance_status" DEFAULT 'reported' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_requests_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "maintenance_requests_title_length" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "maintenance_requests_description_length" CHECK (char_length(description) between 1 and 4000),
	CONSTRAINT "maintenance_requests_location_length" CHECK (char_length(location) <= 120)
);
--> statement-breakpoint
ALTER TABLE "maintenance_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"sender" "message_sender" NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "messages_body_length" CHECK (char_length(btrim(body)) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rent_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"kind" "rent_charge_kind" DEFAULT 'rent' NOT NULL,
	"source" "rent_charge_source" DEFAULT 'manual' NOT NULL,
	"period_start" date,
	"period_end" date,
	"due_date" date NOT NULL,
	"amount_pence" integer NOT NULL,
	"description" text NOT NULL,
	"status" "ledger_status" DEFAULT 'active' NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_charges_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "rent_charges_amount_positive" CHECK (amount_pence > 0),
	CONSTRAINT "rent_charges_period_in_order" CHECK (period_end >= period_start),
	CONSTRAINT "rent_charges_void_recorded" CHECK ((status = 'voided') = (void_reason is not null and voided_at is not null))
);
--> statement-breakpoint
ALTER TABLE "rent_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rent_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_pence" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"status" "ledger_status" DEFAULT 'active' NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_payments_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "rent_payments_amount_positive" CHECK (amount_pence > 0),
	CONSTRAINT "rent_payments_reference_length" CHECK (char_length(reference) <= 100),
	CONSTRAINT "rent_payments_void_recorded" CHECK ((status = 'voided') = (void_reason is not null and voided_at is not null))
);
--> statement-breakpoint
ALTER TABLE "rent_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_portal_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_portal_invites_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "tenant_portal_invites_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "tenant_portal_invites_token_hash_format" CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "tenant_portal_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "welcome_pack" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "document_services" ADD CONSTRAINT "document_services_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_services" ADD CONSTRAINT "document_services_served_by_users_id_fk" FOREIGN KEY ("served_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_services" ADD CONSTRAINT "document_services_document_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."documents"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_services" ADD CONSTRAINT "document_services_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_request_fk" FOREIGN KEY ("request_id","org_id") REFERENCES "public"."maintenance_requests"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_fk" FOREIGN KEY ("property_id","org_id") REFERENCES "public"."properties"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_room_fk" FOREIGN KEY ("room_id","org_id") REFERENCES "public"."rooms"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_invites" ADD CONSTRAINT "tenant_portal_invites_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_invites" ADD CONSTRAINT "tenant_portal_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_invites" ADD CONSTRAINT "tenant_portal_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_invites" ADD CONSTRAINT "tenant_portal_invites_tenant_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."tenants"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_services_org_id_idx" ON "document_services" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "document_services_tenancy_id_idx" ON "document_services" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "maintenance_photos_org_id_idx" ON "maintenance_photos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "maintenance_photos_request_id_idx" ON "maintenance_photos" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "maintenance_requests_org_id_idx" ON "maintenance_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "maintenance_requests_property_id_idx" ON "maintenance_requests" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "maintenance_requests_tenancy_id_idx" ON "maintenance_requests" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "messages_org_id_idx" ON "messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "messages_tenancy_id_created_at_idx" ON "messages" USING btree ("tenancy_id","created_at");--> statement-breakpoint
CREATE INDEX "rent_charges_org_id_idx" ON "rent_charges" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rent_charges_tenancy_id_idx" ON "rent_charges" USING btree ("tenancy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rent_charges_one_per_period" ON "rent_charges" USING btree ("tenancy_id","period_start") WHERE source = 'schedule';--> statement-breakpoint
CREATE INDEX "rent_payments_org_id_idx" ON "rent_payments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rent_payments_tenancy_id_idx" ON "rent_payments" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "tenant_portal_invites_org_id_idx" ON "tenant_portal_invites" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenants_user_id_idx" ON "tenants" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_welcome_pack_length" CHECK (char_length(welcome_pack) <= 20000);