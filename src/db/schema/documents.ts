import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { owners } from "./owners";
import { properties } from "./properties";
import { rooms } from "./rooms";
import { tenancies } from "./tenancies";
import { tenants } from "./tenants";
import { users } from "./users";

export const documentType = pgEnum("document_type", [
  "gas_safety",
  "eicr",
  "epc",
  "hmo_licence",
  "fire_risk_assessment",
  "tenancy_agreement",
  "right_to_rent",
  "deposit_certificate",
  "inventory",
  "other",
]);

/**
 * A stored file, linked to exactly one property, room, tenancy, tenant or
 * owner. file_path is the Storage object path and starts with the org_id.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    documentType: documentType("document_type").notNull(),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    expiryDate: date("expiry_date"),
    propertyId: uuid("property_id"),
    roomId: uuid("room_id"),
    tenancyId: uuid("tenancy_id"),
    tenantId: uuid("tenant_id"),
    ownerId: uuid("owner_id"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("documents_org_id_expiry_date_idx").on(table.orgId, table.expiryDate),
    index("documents_property_id_idx").on(table.propertyId),
    index("documents_room_id_idx").on(table.roomId),
    index("documents_tenancy_id_idx").on(table.tenancyId),
    index("documents_tenant_id_idx").on(table.tenantId),
    index("documents_owner_id_idx").on(table.ownerId),
    foreignKey({
      name: "documents_property_fk",
      columns: [table.propertyId, table.orgId],
      foreignColumns: [properties.id, properties.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_room_fk",
      columns: [table.roomId, table.orgId],
      foreignColumns: [rooms.id, rooms.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_tenant_fk",
      columns: [table.tenantId, table.orgId],
      foreignColumns: [tenants.id, tenants.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_owner_fk",
      columns: [table.ownerId, table.orgId],
      foreignColumns: [owners.id, owners.orgId],
    }).onDelete("restrict"),
    check(
      "documents_linked_to_one_record",
      sql`num_nonnulls(property_id, room_id, tenancy_id, tenant_id, owner_id) = 1`,
    ),
    check("documents_file_path_in_org_folder", sql`starts_with(file_path, org_id::text || '/')`),
  ],
).enableRLS();

export type Document = typeof documents.$inferSelect;
export type DocumentType = (typeof documentType.enumValues)[number];
