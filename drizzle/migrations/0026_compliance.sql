CREATE TYPE "public"."certificate_channel" AS ENUM('portal', 'email_and_portal');--> statement-breakpoint
CREATE TYPE "public"."compliance_category" AS ENUM('gas', 'electrical', 'energy', 'fire', 'licence', 'health_and_safety', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed', 'no_email');--> statement-breakpoint
CREATE TABLE "certificate_service_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"certificate_service_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"channel" "certificate_channel" NOT NULL,
	"email_status" "email_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_service_recipients_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "certificate_service_recipients_email_matches_channel" CHECK ((channel = 'portal') = (email_status = 'no_email')),
	CONSTRAINT "certificate_service_recipients_error_length" CHECK (char_length(error) <= 200)
);
--> statement-breakpoint
ALTER TABLE "certificate_service_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificate_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"property_service_id" uuid,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_services_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "certificate_services_subject_length" CHECK (char_length(subject) between 1 and 200),
	CONSTRAINT "certificate_services_message_length" CHECK (char_length(message) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "certificate_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "property_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"last_done_on" date,
	"expires_on" date,
	"document_id" uuid,
	"notes" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"not_required" boolean DEFAULT false NOT NULL,
	"not_required_reason" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_services_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "property_services_one_per_type" UNIQUE("property_id","service_type_id"),
	CONSTRAINT "property_services_notes_length" CHECK (char_length(notes) <= 2000),
	CONSTRAINT "property_services_details_is_object" CHECK (jsonb_typeof(details) = 'object'),
	CONSTRAINT "property_services_dates_in_order" CHECK (expires_on is null or last_done_on is null or expires_on >= last_done_on),
	CONSTRAINT "property_services_not_required_reason" CHECK (not not_required or char_length(trim(not_required_reason)) between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "property_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "compliance_category" NOT NULL,
	"validity_months" integer,
	"alert_window_days" integer DEFAULT 30 NOT NULL,
	"requires_document" boolean DEFAULT true NOT NULL,
	"document_type" "document_type" DEFAULT 'other' NOT NULL,
	"auto_create_job" boolean DEFAULT false NOT NULL,
	"expiry_label" text DEFAULT 'Expires' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_types_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "service_types_name_length" CHECK (char_length(name) between 1 and 80),
	CONSTRAINT "service_types_validity_range" CHECK (validity_months is null or validity_months between 1 and 240),
	CONSTRAINT "service_types_alert_window_range" CHECK (alert_window_days between 0 and 365),
	CONSTRAINT "service_types_expiry_label_length" CHECK (char_length(expiry_label) between 1 and 40),
	CONSTRAINT "service_types_fields_is_list" CHECK (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 20)
);
--> statement-breakpoint
ALTER TABLE "service_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "compliance_emails" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD COLUMN "property_service_id" uuid;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD COLUMN "due_cycle" date;--> statement-breakpoint
ALTER TABLE "certificate_service_recipients" ADD CONSTRAINT "certificate_service_recipients_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_service_recipients" ADD CONSTRAINT "certificate_service_recipients_service_fk" FOREIGN KEY ("certificate_service_id","org_id") REFERENCES "public"."certificate_services"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_service_recipients" ADD CONSTRAINT "certificate_service_recipients_tenant_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."tenants"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_service_recipients" ADD CONSTRAINT "certificate_service_recipients_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_services" ADD CONSTRAINT "certificate_services_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_services" ADD CONSTRAINT "certificate_services_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_services" ADD CONSTRAINT "certificate_services_property_fk" FOREIGN KEY ("property_id","org_id") REFERENCES "public"."properties"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_services" ADD CONSTRAINT "certificate_services_document_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."documents"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_services" ADD CONSTRAINT "certificate_services_property_service_fk" FOREIGN KEY ("property_service_id","org_id") REFERENCES "public"."property_services"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_services" ADD CONSTRAINT "property_services_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_services" ADD CONSTRAINT "property_services_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_services" ADD CONSTRAINT "property_services_property_fk" FOREIGN KEY ("property_id","org_id") REFERENCES "public"."properties"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_services" ADD CONSTRAINT "property_services_type_fk" FOREIGN KEY ("service_type_id","org_id") REFERENCES "public"."service_types"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_services" ADD CONSTRAINT "property_services_document_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."documents"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificate_service_recipients_org_id_idx" ON "certificate_service_recipients" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "certificate_service_recipients_service_idx" ON "certificate_service_recipients" USING btree ("certificate_service_id");--> statement-breakpoint
CREATE INDEX "certificate_services_org_id_idx" ON "certificate_services" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "certificate_services_document_id_idx" ON "certificate_services" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "property_services_org_id_idx" ON "property_services" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "service_types_org_id_idx" ON "service_types" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_system_key" ON "service_types" USING btree ("org_id","system_key");--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_service_fk" FOREIGN KEY ("property_service_id","org_id") REFERENCES "public"."property_services"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_requests_one_per_cycle" ON "maintenance_requests" USING btree ("property_service_id","due_cycle");