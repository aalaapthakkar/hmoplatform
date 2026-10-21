import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
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
import { documents } from "./documents";
import { tenancies } from "./tenancies";
import { users } from "./users";

export const guarantorStatus = pgEnum("guarantor_status", ["required", "removed"]);

/**
 * A guarantor for a tenancy. Removing the requirement is a status change,
 * with who did it, when and why, so it's never lost.
 */
export const tenancyGuarantors = pgTable(
  "tenancy_guarantors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenancyId: uuid("tenancy_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    status: guarantorStatus("status").notNull().default("required"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id, { onDelete: "set null" }),
    removedReason: text("removed_reason"),
    ...timestamps,
  },
  (table) => [
    unique("tenancy_guarantors_id_org_id_key").on(table.id, table.orgId),
    index("tenancy_guarantors_org_id_idx").on(table.orgId),
    uniqueIndex("tenancy_guarantors_one_required_per_tenancy")
      .on(table.tenancyId)
      .where(sql`status = 'required'`),
    foreignKey({
      name: "tenancy_guarantors_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    check(
      "tenancy_guarantors_removal_recorded",
      sql`(status = 'removed') = (removed_at is not null and removed_reason is not null)`,
    ),
    check("tenancy_guarantors_reason_length", sql`char_length(removed_reason) <= 500`),
  ],
).enableRLS();

export const documentTemplateKind = pgEnum("document_template_kind", [
  "tenancy_agreement",
  "guarantor_agreement",
]);

/** Wording for generated documents, with {{merge_fields}}. Only admins edit these. */
export const documentTemplates = pgTable(
  "document_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    kind: documentTemplateKind("kind").notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    /** Until a solicitor has approved the wording, every page is stamped DRAFT. */
    isDraft: boolean("is_draft").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("document_templates_id_org_id_key").on(table.id, table.orgId),
    index("document_templates_org_id_idx").on(table.orgId),
    uniqueIndex("document_templates_one_default_per_kind")
      .on(table.orgId, table.kind)
      .where(sql`is_default and status = 'active'`),
    check("document_templates_body_length", sql`char_length(body) <= 50000`),
  ],
).enableRLS();

export const signatureRequestStatus = pgEnum("signature_request_status", [
  "sent",
  "partly_signed",
  "completed",
  "declined",
  "cancelled",
  "error",
]);

/**
 * One document sent for e-signature. The tenancy and guarantor agreements
 * are separate requests, so one can be cancelled without touching the other.
 */
export const signatureRequests = pgTable(
  "signature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenancyId: uuid("tenancy_id").notNull(),
    kind: documentTemplateKind("kind").notNull(),
    templateId: uuid("template_id"),
    guarantorId: uuid("guarantor_id"),
    provider: text("provider").notNull(),
    providerRequestId: text("provider_request_id").notNull(),
    status: signatureRequestStatus("status").notNull().default("sent"),
    unsignedDocumentId: uuid("unsigned_document_id"),
    signedDocumentId: uuid("signed_document_id"),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("signature_requests_id_org_id_key").on(table.id, table.orgId),
    unique("signature_requests_provider_request_key").on(table.provider, table.providerRequestId),
    index("signature_requests_org_id_idx").on(table.orgId),
    index("signature_requests_tenancy_id_idx").on(table.tenancyId),
    uniqueIndex("signature_requests_one_open_per_kind")
      .on(table.tenancyId, table.kind)
      .where(sql`status in ('sent', 'partly_signed')`),
    foreignKey({
      name: "signature_requests_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "signature_requests_template_fk",
      columns: [table.templateId, table.orgId],
      foreignColumns: [documentTemplates.id, documentTemplates.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "signature_requests_guarantor_fk",
      columns: [table.guarantorId, table.orgId],
      foreignColumns: [tenancyGuarantors.id, tenancyGuarantors.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "signature_requests_unsigned_document_fk",
      columns: [table.unsignedDocumentId, table.orgId],
      foreignColumns: [documents.id, documents.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "signature_requests_signed_document_fk",
      columns: [table.signedDocumentId, table.orgId],
      foreignColumns: [documents.id, documents.orgId],
    }).onDelete("restrict"),
    check(
      "signature_requests_guarantor_for_guarantor_agreement",
      sql`(kind = 'guarantor_agreement') = (guarantor_id is not null)`,
    ),
  ],
).enableRLS();

export const signerRole = pgEnum("signer_role", ["tenant", "guarantor", "organisation"]);
export const signerStatus = pgEnum("signer_status", ["awaiting", "signed", "declined"]);

export const signatureRequestSigners = pgTable(
  "signature_request_signers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    requestId: uuid("request_id").notNull(),
    role: signerRole("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    signingOrder: smallint("signing_order").notNull(),
    status: signerStatus("status").notNull().default("awaiting"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("signature_request_signers_id_org_id_key").on(table.id, table.orgId),
    unique("signature_request_signers_order_key").on(table.requestId, table.signingOrder),
    index("signature_request_signers_org_id_idx").on(table.orgId),
    foreignKey({
      name: "signature_request_signers_request_fk",
      columns: [table.requestId, table.orgId],
      foreignColumns: [signatureRequests.id, signatureRequests.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();

/** Each provider event once: a history of what happened, and protection against replays. */
export const esignEvents = pgTable(
  "esign_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    requestId: uuid("request_id").notNull(),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("esign_events_id_org_id_key").on(table.id, table.orgId),
    unique("esign_events_event_key_key").on(table.eventKey),
    index("esign_events_org_id_idx").on(table.orgId),
    foreignKey({
      name: "esign_events_request_fk",
      columns: [table.requestId, table.orgId],
      foreignColumns: [signatureRequests.id, signatureRequests.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();

export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
