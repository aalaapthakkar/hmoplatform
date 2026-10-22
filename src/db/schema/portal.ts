import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { documents } from "./documents";
import { properties } from "./properties";
import { rooms } from "./rooms";
import { tenancies } from "./tenancies";
import { tenants } from "./tenants";
import { users } from "./users";

/** An invite to the tenant portal. Only the link's SHA-256 hash is stored. */
export const tenantPortalInvites = pgTable(
  "tenant_portal_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenantId: uuid("tenant_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("tenant_portal_invites_id_org_id_key").on(table.id, table.orgId),
    unique("tenant_portal_invites_token_hash_key").on(table.tokenHash),
    index("tenant_portal_invites_org_id_idx").on(table.orgId),
    foreignKey({
      name: "tenant_portal_invites_tenant_fk",
      columns: [table.tenantId, table.orgId],
      foreignColumns: [tenants.id, tenants.orgId],
    }).onDelete("restrict"),
    check("tenant_portal_invites_token_hash_format", sql`token_hash ~ '^[0-9a-f]{64}$'`),
  ],
).enableRLS();

export const rentChargeKind = pgEnum("rent_charge_kind", ["rent", "other"]);
export const rentChargeSource = pgEnum("rent_charge_source", ["schedule", "manual"]);

/**
 * What a tenant owes. Rent charges are made from the tenancy's rent and due
 * day by the daily rent job, one per period. The ledger is append-only: rows
 * are never edited or deleted, and a mistake is put right by a reversal (a
 * row pointing at the one it cancels, with the reason as its description).
 * The balance is never stored: it's always worked out from the ledger.
 */
export const rentCharges = pgTable(
  "rent_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenancyId: uuid("tenancy_id").notNull(),
    kind: rentChargeKind("kind").notNull().default("rent"),
    source: rentChargeSource("source").notNull().default("manual"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    dueDate: date("due_date").notNull(),
    amountPence: integer("amount_pence").notNull(),
    description: text("description").notNull(),
    /** Set on a reversal: the charge it cancels. The amount is the same and counts the other way. */
    reversesChargeId: uuid("reverses_charge_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("rent_charges_id_org_id_key").on(table.id, table.orgId),
    index("rent_charges_org_id_idx").on(table.orgId),
    index("rent_charges_tenancy_id_idx").on(table.tenancyId),
    // For the rent job finding a period's charges. It charges each period once
    // (holding a lock per tenancy while it works), so this needn't be unique.
    index("rent_charges_schedule_period_idx")
      .on(table.tenancyId, table.periodStart)
      .where(sql`source = 'schedule'`),
    // A charge can be reversed only once.
    uniqueIndex("rent_charges_reversed_once").on(table.reversesChargeId),
    foreignKey({
      name: "rent_charges_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "rent_charges_reverses_fk",
      columns: [table.reversesChargeId, table.orgId],
      foreignColumns: [table.id, table.orgId],
    }).onDelete("restrict"),
    check("rent_charges_amount_positive", sql`amount_pence > 0`),
    check("rent_charges_period_in_order", sql`period_end >= period_start`),
    check(
      "rent_charges_reversal_has_no_period",
      sql`reverses_charge_id is null or (period_start is null and period_end is null)`,
    ),
  ],
).enableRLS();

export const paymentMethod = pgEnum("payment_method", [
  "bank_transfer",
  "standing_order",
  "card",
  "cash",
  "other",
]);

/**
 * Money received, recorded by staff. Append-only like charges: a mistake is
 * put right by a reversal row, with the reason as its note.
 */
export const rentPayments = pgTable(
  "rent_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenancyId: uuid("tenancy_id").notNull(),
    paidOn: date("paid_on").notNull(),
    amountPence: integer("amount_pence").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    /** Set on a reversal: the payment it cancels. */
    reversesPaymentId: uuid("reverses_payment_id"),
    /** Why a payment was reversed. */
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("rent_payments_id_org_id_key").on(table.id, table.orgId),
    index("rent_payments_org_id_idx").on(table.orgId),
    index("rent_payments_tenancy_id_idx").on(table.tenancyId),
    // A payment can be reversed only once.
    uniqueIndex("rent_payments_reversed_once").on(table.reversesPaymentId),
    foreignKey({
      name: "rent_payments_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "rent_payments_reverses_fk",
      columns: [table.reversesPaymentId, table.orgId],
      foreignColumns: [table.id, table.orgId],
    }).onDelete("restrict"),
    check("rent_payments_amount_positive", sql`amount_pence > 0`),
    check("rent_payments_reference_length", sql`char_length(reference) <= 100`),
    check("rent_payments_note_length", sql`char_length(note) <= 300`),
    check(
      "rent_payments_reversal_has_reason",
      sql`reverses_payment_id is null or char_length(trim(note)) > 0`,
    ),
  ],
).enableRLS();

export const maintenanceUrgency = pgEnum("maintenance_urgency", [
  "low",
  "normal",
  "urgent",
  "emergency",
]);
export const maintenanceStatus = pgEnum("maintenance_status", [
  "reported",
  "in_progress",
  "done",
  "closed",
]);

/** A repair, reported by a tenant (with tenancy_id) or logged by staff. */
export const maintenanceRequests = pgTable(
  "maintenance_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull(),
    roomId: uuid("room_id"),
    tenancyId: uuid("tenancy_id"),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    urgency: maintenanceUrgency("urgency").notNull().default("normal"),
    status: maintenanceStatus("status").notNull().default("reported"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("maintenance_requests_id_org_id_key").on(table.id, table.orgId),
    index("maintenance_requests_org_id_idx").on(table.orgId),
    index("maintenance_requests_property_id_idx").on(table.propertyId),
    index("maintenance_requests_tenancy_id_idx").on(table.tenancyId),
    foreignKey({
      name: "maintenance_requests_property_fk",
      columns: [table.propertyId, table.orgId],
      foreignColumns: [properties.id, properties.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "maintenance_requests_room_fk",
      columns: [table.roomId, table.orgId],
      foreignColumns: [rooms.id, rooms.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "maintenance_requests_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    check("maintenance_requests_title_length", sql`char_length(title) between 1 and 120`),
    check(
      "maintenance_requests_description_length",
      sql`char_length(description) between 1 and 4000`,
    ),
    check("maintenance_requests_location_length", sql`char_length(location) <= 120`),
  ],
).enableRLS();

/** A photo of a repair, stored privately at <org>/maintenance/<request>/<file>. */
export const maintenancePhotos = pgTable(
  "maintenance_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    requestId: uuid("request_id").notNull(),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("maintenance_photos_id_org_id_key").on(table.id, table.orgId),
    index("maintenance_photos_org_id_idx").on(table.orgId),
    index("maintenance_photos_request_id_idx").on(table.requestId),
    foreignKey({
      name: "maintenance_photos_request_fk",
      columns: [table.requestId, table.orgId],
      foreignColumns: [maintenanceRequests.id, maintenanceRequests.orgId],
    }).onDelete("restrict"),
    check(
      "maintenance_photos_path_in_request_folder",
      sql`starts_with(file_path, org_id::text || '/maintenance/' || request_id::text || '/')`,
    ),
  ],
).enableRLS();

export const messageSender = pgEnum("message_sender", ["tenant", "staff"]);

/** The conversation between a tenancy's tenants and the organisation. Never edited or deleted. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenancyId: uuid("tenancy_id").notNull(),
    sender: messageSender("sender").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("messages_id_org_id_key").on(table.id, table.orgId),
    index("messages_org_id_idx").on(table.orgId),
    index("messages_tenancy_id_created_at_idx").on(table.tenancyId, table.createdAt),
    foreignKey({
      name: "messages_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    check("messages_body_length", sql`char_length(btrim(body)) between 1 and 4000`),
  ],
).enableRLS();

export const serviceMethod = pgEnum("service_method", ["portal", "email", "post", "by_hand"]);

/** A document served to a tenancy: what, when and how. Tenants can see what's served to them. */
export const documentServices = pgTable(
  "document_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    documentId: uuid("document_id").notNull(),
    tenancyId: uuid("tenancy_id").notNull(),
    servedAt: timestamp("served_at", { withTimezone: true }).notNull().defaultNow(),
    method: serviceMethod("method").notNull().default("portal"),
    servedBy: uuid("served_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("document_services_id_org_id_key").on(table.id, table.orgId),
    unique("document_services_document_tenancy_key").on(table.documentId, table.tenancyId),
    index("document_services_org_id_idx").on(table.orgId),
    index("document_services_tenancy_id_idx").on(table.tenancyId),
    foreignKey({
      name: "document_services_document_fk",
      columns: [table.documentId, table.orgId],
      foreignColumns: [documents.id, documents.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "document_services_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();
