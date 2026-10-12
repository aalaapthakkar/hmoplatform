import { foreignKey, index, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { linkStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { owners } from "./owners";
import { properties } from "./properties";

export const propertyOwners = pgTable(
  "property_owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    status: linkStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("property_owners_property_id_owner_id_key").on(table.propertyId, table.ownerId),
    index("property_owners_org_id_idx").on(table.orgId),
    index("property_owners_owner_id_idx").on(table.ownerId),
    foreignKey({
      name: "property_owners_property_fk",
      columns: [table.propertyId, table.orgId],
      foreignColumns: [properties.id, properties.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "property_owners_owner_fk",
      columns: [table.ownerId, table.orgId],
      foreignColumns: [owners.id, owners.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();

export type PropertyOwner = typeof propertyOwners.$inferSelect;
