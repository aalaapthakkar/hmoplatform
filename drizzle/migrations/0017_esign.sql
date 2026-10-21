-- Documents need (id, org_id) unique before other tables can link to them.
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_org_id_key" UNIQUE("id","org_id");--> statement-breakpoint
CREATE TYPE "public"."document_template_kind" AS ENUM('tenancy_agreement', 'guarantor_agreement');--> statement-breakpoint
CREATE TYPE "public"."guarantor_status" AS ENUM('required', 'removed');--> statement-breakpoint
CREATE TYPE "public"."signature_request_status" AS ENUM('sent', 'partly_signed', 'completed', 'declined', 'cancelled', 'error');--> statement-breakpoint
CREATE TYPE "public"."signer_role" AS ENUM('tenant', 'guarantor', 'organisation');--> statement-breakpoint
CREATE TYPE "public"."signer_status" AS ENUM('awaiting', 'signed', 'declined');--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "document_template_kind" NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_templates_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "document_templates_body_length" CHECK (char_length(body) <= 50000)
);
--> statement-breakpoint
ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "esign_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"event_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esign_events_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "esign_events_event_key_key" UNIQUE("event_key")
);
--> statement-breakpoint
ALTER TABLE "esign_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "signature_request_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"role" "signer_role" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"signing_order" smallint NOT NULL,
	"status" "signer_status" DEFAULT 'awaiting' NOT NULL,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_request_signers_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "signature_request_signers_order_key" UNIQUE("request_id","signing_order")
);
--> statement-breakpoint
ALTER TABLE "signature_request_signers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"kind" "document_template_kind" NOT NULL,
	"template_id" uuid,
	"guarantor_id" uuid,
	"provider" text NOT NULL,
	"provider_request_id" text NOT NULL,
	"status" "signature_request_status" DEFAULT 'sent' NOT NULL,
	"unsigned_document_id" uuid,
	"signed_document_id" uuid,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_requests_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "signature_requests_provider_request_key" UNIQUE("provider","provider_request_id"),
	CONSTRAINT "signature_requests_guarantor_for_guarantor_agreement" CHECK ((kind = 'guarantor_agreement') = (guarantor_id is not null))
);
--> statement-breakpoint
ALTER TABLE "signature_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy_guarantors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"status" "guarantor_status" DEFAULT 'required' NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenancy_guarantors_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "tenancy_guarantors_removal_recorded" CHECK ((status = 'removed') = (removed_at is not null and removed_reason is not null)),
	CONSTRAINT "tenancy_guarantors_reason_length" CHECK (char_length(removed_reason) <= 500)
);
--> statement-breakpoint
ALTER TABLE "tenancy_guarantors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_events" ADD CONSTRAINT "esign_events_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_events" ADD CONSTRAINT "esign_events_request_fk" FOREIGN KEY ("request_id","org_id") REFERENCES "public"."signature_requests"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_request_signers" ADD CONSTRAINT "signature_request_signers_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_request_signers" ADD CONSTRAINT "signature_request_signers_request_fk" FOREIGN KEY ("request_id","org_id") REFERENCES "public"."signature_requests"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_template_fk" FOREIGN KEY ("template_id","org_id") REFERENCES "public"."document_templates"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_guarantor_fk" FOREIGN KEY ("guarantor_id","org_id") REFERENCES "public"."tenancy_guarantors"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_unsigned_document_fk" FOREIGN KEY ("unsigned_document_id","org_id") REFERENCES "public"."documents"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_signed_document_fk" FOREIGN KEY ("signed_document_id","org_id") REFERENCES "public"."documents"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_guarantors" ADD CONSTRAINT "tenancy_guarantors_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_guarantors" ADD CONSTRAINT "tenancy_guarantors_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_guarantors" ADD CONSTRAINT "tenancy_guarantors_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_templates_org_id_idx" ON "document_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_one_default_per_kind" ON "document_templates" USING btree ("org_id","kind") WHERE is_default and status = 'active';--> statement-breakpoint
CREATE INDEX "esign_events_org_id_idx" ON "esign_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "signature_request_signers_org_id_idx" ON "signature_request_signers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "signature_requests_org_id_idx" ON "signature_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "signature_requests_tenancy_id_idx" ON "signature_requests" USING btree ("tenancy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_requests_one_open_per_kind" ON "signature_requests" USING btree ("tenancy_id","kind") WHERE status in ('sent', 'partly_signed');--> statement-breakpoint
CREATE INDEX "tenancy_guarantors_org_id_idx" ON "tenancy_guarantors" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenancy_guarantors_one_required_per_tenancy" ON "tenancy_guarantors" USING btree ("tenancy_id") WHERE status = 'required';