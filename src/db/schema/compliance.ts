import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { documents, documentType } from "./documents";
import { properties } from "./properties";
import { tenancies } from "./tenancies";
import { tenants } from "./tenants";
import { users } from "./users";

export const complianceCategory = pgEnum("compliance_category", [
  "gas",
  "electrical",
  "energy",
  "fire",
  "licence",
  "health_and_safety",
  "insurance",
  "other",
]);

/**
 * A kind of check, certificate or licence a property needs, such as a gas
 * safety certificate. Each organisation has its own set: seeded with common
 * ones, and theirs to edit. `fields` describes extra details to record (an
 * HMO licence number, say), as [{ key, label, kind, options }].
 */
export const serviceTypes = pgTable(
  "service_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    name: text("name").notNull(),
    category: complianceCategory("category").notNull(),
    /** How long it lasts once done. Null: no fixed cycle, the expiry or renewal date is typed in. */
    validityMonths: integer("validity_months"),
    /** How many days before expiry it shows as due soon and reminders go out. */
    alertWindowDays: integer("alert_window_days").notNull().default(30),
    requiresDocument: boolean("requires_document").notNull().default(true),
    /** The type uploaded certificates are filed under. */
    documentType: documentType("document_type").notNull().default("other"),
    /** Opens a maintenance job when it comes due. */
    autoCreateJob: boolean("auto_create_job").notNull().default(false),
    /** "Expires", or "Renewal date" for registrations. */
    expiryLabel: text("expiry_label").notNull().default("Expires"),
    fields: jsonb("fields")
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: recordStatus("status").notNull().default("active"),
    /** Set on the types every organisation starts with, so seeding never doubles up. */
    systemKey: text("system_key"),
    ...timestamps,
  },
  (table) => [
    unique("service_types_id_org_id_key").on(table.id, table.orgId),
    index("service_types_org_id_idx").on(table.orgId),
    uniqueIndex("service_types_system_key").on(table.orgId, table.systemKey),
    check("service_types_name_length", sql`char_length(name) between 1 and 80`),
    check(
      "service_types_validity_range",
      sql`validity_months is null or validity_months between 1 and 240`,
    ),
    check("service_types_alert_window_range", sql`alert_window_days between 0 and 365`),
    check("service_types_expiry_label_length", sql`char_length(expiry_label) between 1 and 40`),
    check(
      "service_types_fields_is_list",
      sql`jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 20`,
    ),
  ],
).enableRLS();

/**
 * Where a property stands on one service type: when it was last done, when it
 * expires, the certificate, extra details, or that it isn't needed here. Its
 * status is worked out by the compliance_items view, never stored.
 */
export const propertyServices = pgTable(
  "property_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull(),
    serviceTypeId: uuid("service_type_id").notNull(),
    lastDoneOn: date("last_done_on"),
    expiresOn: date("expires_on"),
    documentId: uuid("document_id"),
    notes: text("notes"),
    /** Answers to the type's extra fields, by key. */
    details: jsonb("details")
      .notNull()
      .default(sql`'{}'::jsonb`),
    notRequired: boolean("not_required").notNull().default(false),
    notRequiredReason: text("not_required_reason"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("property_services_id_org_id_key").on(table.id, table.orgId),
    unique("property_services_one_per_type").on(table.propertyId, table.serviceTypeId),
    index("property_services_org_id_idx").on(table.orgId),
    foreignKey({
      name: "property_services_property_fk",
      columns: [table.propertyId, table.orgId],
      foreignColumns: [properties.id, properties.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "property_services_type_fk",
      columns: [table.serviceTypeId, table.orgId],
      foreignColumns: [serviceTypes.id, serviceTypes.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "property_services_document_fk",
      columns: [table.documentId, table.orgId],
      foreignColumns: [documents.id, documents.orgId],
    }).onDelete("restrict"),
    check("property_services_notes_length", sql`char_length(notes) <= 2000`),
    check("property_services_details_is_object", sql`jsonb_typeof(details) = 'object'`),
    check(
      "property_services_dates_in_order",
      sql`expires_on is null or last_done_on is null or expires_on >= last_done_on`,
    ),
    check(
      "property_services_not_required_reason",
      sql`not not_required or char_length(trim(not_required_reason)) between 1 and 300`,
    ),
  ],
).enableRLS();

/** One go at giving a certificate to a property's tenants. Never edited. */
export const certificateServices = pgTable(
  "certificate_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull(),
    documentId: uuid("document_id").notNull(),
    propertyServiceId: uuid("property_service_id"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    unique("certificate_services_id_org_id_key").on(table.id, table.orgId),
    index("certificate_services_org_id_idx").on(table.orgId),
    index("certificate_services_document_id_idx").on(table.documentId),
    foreignKey({
      name: "certificate_services_property_fk",
      columns: [table.propertyId, table.orgId],
      foreignColumns: [properties.id, properties.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "certificate_services_document_fk",
      columns: [table.documentId, table.orgId],
      foreignColumns: [documents.id, documents.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "certificate_services_property_service_fk",
      columns: [table.propertyServiceId, table.orgId],
      foreignColumns: [propertyServices.id, propertyServices.orgId],
    }).onDelete("restrict"),
    check("certificate_services_subject_length", sql`char_length(subject) between 1 and 200`),
    check("certificate_services_message_length", sql`char_length(message) between 1 and 4000`),
  ],
).enableRLS();

export const certificateChannel = pgEnum("certificate_channel", ["portal", "email_and_portal"]);
export const emailStatus = pgEnum("email_status", ["sent", "failed", "no_email"]);

/** Who a certificate went to, how, and whether the email got out. Never edited. */
export const certificateServiceRecipients = pgTable(
  "certificate_service_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    certificateServiceId: uuid("certificate_service_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    tenancyId: uuid("tenancy_id").notNull(),
    /** The name and email as they were when it was sent. */
    name: text("name").notNull(),
    email: text("email"),
    channel: certificateChannel("channel").notNull(),
    emailStatus: emailStatus("email_status").notNull(),
    providerMessageId: text("provider_message_id"),
    /** A short reason the email failed, never the provider's raw response. */
    error: text("error"),
    ...timestamps,
  },
  (table) => [
    unique("certificate_service_recipients_id_org_id_key").on(table.id, table.orgId),
    index("certificate_service_recipients_org_id_idx").on(table.orgId),
    index("certificate_service_recipients_service_idx").on(table.certificateServiceId),
    foreignKey({
      name: "certificate_service_recipients_service_fk",
      columns: [table.certificateServiceId, table.orgId],
      foreignColumns: [certificateServices.id, certificateServices.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "certificate_service_recipients_tenant_fk",
      columns: [table.tenantId, table.orgId],
      foreignColumns: [tenants.id, tenants.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "certificate_service_recipients_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    check(
      "certificate_service_recipients_email_matches_channel",
      sql`(channel = 'portal') = (email_status = 'no_email')`,
    ),
    check("certificate_service_recipients_error_length", sql`char_length(error) <= 200`),
  ],
).enableRLS();
