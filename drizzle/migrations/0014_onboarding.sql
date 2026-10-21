CREATE TYPE "public"."onboarding_status" AS ENUM('in_progress', 'completed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step_kind" AS ENUM('application_form', 'right_to_rent', 'referencing', 'holding_deposit', 'agreement', 'deposit', 'first_rent', 'move_in', 'custom');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step_status" AS ENUM('not_started', 'in_progress', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."right_to_rent_method" AS ENUM('manual_documents', 'online_share_code', 'idsp');--> statement-breakpoint
CREATE TYPE "public"."right_to_rent_permission" AS ENUM('unlimited', 'time_limited');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('right_to_rent_follow_up', 'other');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('open', 'done', 'dismissed');--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"kind" "onboarding_step_kind" NOT NULL,
	"title" text NOT NULL,
	"applicant_title" text NOT NULL,
	"status" "onboarding_step_status" DEFAULT 'not_started' NOT NULL,
	"owner_user_id" uuid,
	"owner_is_applicant" boolean DEFAULT false NOT NULL,
	"due_date" date,
	"notes" text,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_steps_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "onboarding_steps_position_key" UNIQUE("onboarding_id","position"),
	CONSTRAINT "onboarding_steps_one_owner" CHECK (not (owner_is_applicant and owner_user_id is not null)),
	CONSTRAINT "onboarding_steps_notes_length" CHECK (char_length(notes) <= 2000)
);
--> statement-breakpoint
ALTER TABLE "onboarding_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "onboarding_template_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"kind" "onboarding_step_kind" NOT NULL,
	"title" text NOT NULL,
	"applicant_title" text NOT NULL,
	"owner_is_applicant" boolean DEFAULT false NOT NULL,
	"due_offset_days" smallint DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_template_steps_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "onboarding_template_steps_position_key" UNIQUE("template_id","position")
);
--> statement-breakpoint
ALTER TABLE "onboarding_template_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_templates_id_org_id_key" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "onboarding_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "onboardings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"status" "onboarding_status" DEFAULT 'in_progress' NOT NULL,
	"application" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"application_submitted_at" timestamp with time zone,
	"portal_token_hash" text,
	"portal_expires_at" timestamp with time zone,
	"portal_revoked_at" timestamp with time zone,
	"upload_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboardings_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "onboardings_upload_key_key" UNIQUE("upload_key"),
	CONSTRAINT "onboardings_application_is_object" CHECK (jsonb_typeof(application) = 'object'),
	CONSTRAINT "onboardings_portal_token_hash_format" CHECK (portal_token_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "onboardings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "right_to_rent_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"onboarding_id" uuid,
	"check_date" date NOT NULL,
	"method" "right_to_rent_method" NOT NULL,
	"permission" "right_to_rent_permission" NOT NULL,
	"expiry_date" date,
	"notes" text,
	"checked_by" uuid,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "right_to_rent_checks_id_org_id_key" UNIQUE("id","org_id"),
	CONSTRAINT "right_to_rent_checks_expiry_for_time_limited" CHECK ((permission = 'time_limited') = (expiry_date is not null)),
	CONSTRAINT "right_to_rent_checks_expiry_after_check" CHECK (expiry_date > check_date),
	CONSTRAINT "right_to_rent_checks_notes_length" CHECK (char_length(notes) <= 2000)
);
--> statement-breakpoint
ALTER TABLE "right_to_rent_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"status" "reminder_status" DEFAULT 'open' NOT NULL,
	"tenant_id" uuid,
	"source_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_id_org_id_key" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_onboarding_fk" FOREIGN KEY ("onboarding_id","org_id") REFERENCES "public"."onboardings"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_template_steps" ADD CONSTRAINT "onboarding_template_steps_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_template_steps" ADD CONSTRAINT "onboarding_template_steps_template_fk" FOREIGN KEY ("template_id","org_id") REFERENCES "public"."onboarding_templates"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_room_fk" FOREIGN KEY ("room_id","org_id") REFERENCES "public"."rooms"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_tenancy_fk" FOREIGN KEY ("tenancy_id","org_id") REFERENCES "public"."tenancies"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_template_fk" FOREIGN KEY ("template_id","org_id") REFERENCES "public"."onboarding_templates"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "right_to_rent_checks" ADD CONSTRAINT "right_to_rent_checks_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "right_to_rent_checks" ADD CONSTRAINT "right_to_rent_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "right_to_rent_checks" ADD CONSTRAINT "right_to_rent_checks_tenant_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."tenants"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "right_to_rent_checks" ADD CONSTRAINT "right_to_rent_checks_onboarding_fk" FOREIGN KEY ("onboarding_id","org_id") REFERENCES "public"."onboardings"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."tenants"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_steps_org_id_idx" ON "onboarding_steps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "onboarding_template_steps_org_id_idx" ON "onboarding_template_steps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "onboarding_templates_org_id_idx" ON "onboarding_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_templates_one_default_per_org" ON "onboarding_templates" USING btree ("org_id") WHERE is_default and status = 'active';--> statement-breakpoint
CREATE INDEX "onboardings_org_id_idx" ON "onboardings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "onboardings_portal_token_hash_idx" ON "onboardings" USING btree ("portal_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "onboardings_one_in_progress_per_tenancy" ON "onboardings" USING btree ("tenancy_id") WHERE status = 'in_progress';--> statement-breakpoint
CREATE INDEX "right_to_rent_checks_org_id_idx" ON "right_to_rent_checks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "right_to_rent_checks_tenant_id_idx" ON "right_to_rent_checks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "reminders_org_id_due_date_idx" ON "reminders" USING btree ("org_id","due_date");