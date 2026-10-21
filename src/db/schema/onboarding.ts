import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { rooms } from "./rooms";
import { tenancies } from "./tenancies";
import { users } from "./users";

/** What a step is about. "custom" is for steps an org adds to its own workflows later. */
export const onboardingStepKind = pgEnum("onboarding_step_kind", [
  "application_form",
  "right_to_rent",
  "referencing",
  "holding_deposit",
  "agreement",
  "deposit",
  "first_rent",
  "move_in",
  "custom",
]);

export const onboardingStatus = pgEnum("onboarding_status", [
  "in_progress",
  "completed",
  "withdrawn",
]);

export const onboardingStepStatus = pgEnum("onboarding_step_status", [
  "not_started",
  "in_progress",
  "done",
  "skipped",
]);

/** A workflow an org uses to onboard tenants. Each org gets a default one. */
export const onboardingTemplates = pgTable(
  "onboarding_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("onboarding_templates_id_org_id_key").on(table.id, table.orgId),
    index("onboarding_templates_org_id_idx").on(table.orgId),
    uniqueIndex("onboarding_templates_one_default_per_org")
      .on(table.orgId)
      .where(sql`is_default and status = 'active'`),
  ],
).enableRLS();

/** The ordered steps of a template. Copied into each onboarding when it starts. */
export const onboardingTemplateSteps = pgTable(
  "onboarding_template_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    templateId: uuid("template_id").notNull(),
    position: smallint("position").notNull(),
    kind: onboardingStepKind("kind").notNull(),
    title: text("title").notNull(),
    /** What the applicant sees in their portal. */
    applicantTitle: text("applicant_title").notNull(),
    ownerIsApplicant: boolean("owner_is_applicant").notNull().default(false),
    /** Days from the move-in date: negative is before it. */
    dueOffsetDays: smallint("due_offset_days").notNull().default(0),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("onboarding_template_steps_id_org_id_key").on(table.id, table.orgId),
    unique("onboarding_template_steps_position_key").on(table.templateId, table.position),
    index("onboarding_template_steps_org_id_idx").on(table.orgId),
    foreignKey({
      name: "onboarding_template_steps_template_fk",
      columns: [table.templateId, table.orgId],
      foreignColumns: [onboardingTemplates.id, onboardingTemplates.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();

/**
 * Onboarding one applicant into a room, for an upcoming tenancy. The portal
 * token is never stored, only its SHA-256 hash; upload_key names the private
 * folder the applicant can upload into.
 */
export const onboardings = pgTable(
  "onboardings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    roomId: uuid("room_id").notNull(),
    tenancyId: uuid("tenancy_id").notNull(),
    templateId: uuid("template_id").notNull(),
    status: onboardingStatus("status").notNull().default("in_progress"),
    /** The applicant's answers, checked by the app's schema before saving. */
    application: jsonb("application")
      .notNull()
      .default(sql`'{}'::jsonb`),
    applicationSubmittedAt: timestamp("application_submitted_at", { withTimezone: true }),
    portalTokenHash: text("portal_token_hash"),
    portalExpiresAt: timestamp("portal_expires_at", { withTimezone: true }),
    portalRevokedAt: timestamp("portal_revoked_at", { withTimezone: true }),
    uploadKey: uuid("upload_key").notNull().defaultRandom(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("onboardings_id_org_id_key").on(table.id, table.orgId),
    unique("onboardings_upload_key_key").on(table.uploadKey),
    index("onboardings_org_id_idx").on(table.orgId),
    index("onboardings_portal_token_hash_idx").on(table.portalTokenHash),
    uniqueIndex("onboardings_one_in_progress_per_tenancy")
      .on(table.tenancyId)
      .where(sql`status = 'in_progress'`),
    foreignKey({
      name: "onboardings_room_fk",
      columns: [table.roomId, table.orgId],
      foreignColumns: [rooms.id, rooms.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "onboardings_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "onboardings_template_fk",
      columns: [table.templateId, table.orgId],
      foreignColumns: [onboardingTemplates.id, onboardingTemplates.orgId],
    }).onDelete("restrict"),
    check("onboardings_application_is_object", sql`jsonb_typeof(application) = 'object'`),
    check("onboardings_portal_token_hash_format", sql`portal_token_hash ~ '^[0-9a-f]{64}$'`),
  ],
).enableRLS();

/** One step of an onboarding, copied from the template, with its own status, owner and due date. */
export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    onboardingId: uuid("onboarding_id").notNull(),
    position: smallint("position").notNull(),
    kind: onboardingStepKind("kind").notNull(),
    title: text("title").notNull(),
    applicantTitle: text("applicant_title").notNull(),
    status: onboardingStepStatus("status").notNull().default("not_started"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerIsApplicant: boolean("owner_is_applicant").notNull().default(false),
    dueDate: date("due_date"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("onboarding_steps_id_org_id_key").on(table.id, table.orgId),
    unique("onboarding_steps_position_key").on(table.onboardingId, table.position),
    index("onboarding_steps_org_id_idx").on(table.orgId),
    foreignKey({
      name: "onboarding_steps_onboarding_fk",
      columns: [table.onboardingId, table.orgId],
      foreignColumns: [onboardings.id, onboardings.orgId],
    }).onDelete("restrict"),
    check(
      "onboarding_steps_one_owner",
      sql`not (owner_is_applicant and owner_user_id is not null)`,
    ),
    check("onboarding_steps_notes_length", sql`char_length(notes) <= 2000`),
  ],
).enableRLS();

export type Onboarding = typeof onboardings.$inferSelect;
export type OnboardingStep = typeof onboardingSteps.$inferSelect;
export type OnboardingStepKind = (typeof onboardingStepKind.enumValues)[number];
export type OnboardingStepStatus = (typeof onboardingStepStatus.enumValues)[number];
