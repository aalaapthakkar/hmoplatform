import { foreignKey, index, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { linkStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { tenancies } from "./tenancies";
import { tenants } from "./tenants";

/** Who is named on each tenancy. A joint tenancy has several rows. */
export const tenancyTenants = pgTable(
  "tenancy_tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    tenancyId: uuid("tenancy_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    status: linkStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("tenancy_tenants_tenancy_id_tenant_id_key").on(table.tenancyId, table.tenantId),
    index("tenancy_tenants_org_id_idx").on(table.orgId),
    index("tenancy_tenants_tenant_id_idx").on(table.tenantId),
    foreignKey({
      name: "tenancy_tenants_tenancy_fk",
      columns: [table.tenancyId, table.orgId],
      foreignColumns: [tenancies.id, tenancies.orgId],
    }).onDelete("restrict"),
    foreignKey({
      name: "tenancy_tenants_tenant_fk",
      columns: [table.tenantId, table.orgId],
      foreignColumns: [tenants.id, tenants.orgId],
    }).onDelete("restrict"),
  ],
).enableRLS();

export type TenancyTenant = typeof tenancyTenants.$inferSelect;
