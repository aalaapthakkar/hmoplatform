import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  memberships,
  organisations,
  owners,
  properties,
  propertyOwners,
  rooms,
  tenancies,
  tenancyTenants,
  tenants,
} from "../schema";
import {
  DEMO_ORG_ID,
  DEMO_ORG_NAME,
  demoOwners,
  demoProperties,
  demoPropertyOwners,
  demoRooms,
  demoTenancies,
  demoTenancyTenants,
  demoTenants,
} from "./data";

type Database = PgDatabase<PgQueryResultHKT>;

/**
 * Inserts the demo organisation and its records in one transaction. Rows that
 * already exist are left alone, so running it again changes nothing. Pass
 * adminUserId to make an existing user an admin of the demo org.
 */
export async function seedDemoOrg(db: Database, { adminUserId }: { adminUserId?: string } = {}) {
  await db.transaction(async (tx) => {
    await tx
      .insert(organisations)
      .values({ id: DEMO_ORG_ID, name: DEMO_ORG_NAME })
      .onConflictDoNothing();
    await tx.insert(properties).values(demoProperties).onConflictDoNothing();
    await tx.insert(rooms).values(demoRooms).onConflictDoNothing();
    await tx.insert(tenants).values(demoTenants).onConflictDoNothing();
    await tx.insert(tenancies).values(demoTenancies).onConflictDoNothing();
    await tx.insert(tenancyTenants).values(demoTenancyTenants).onConflictDoNothing();
    await tx.insert(owners).values(demoOwners).onConflictDoNothing();
    await tx.insert(propertyOwners).values(demoPropertyOwners).onConflictDoNothing();

    if (adminUserId) {
      await tx
        .insert(memberships)
        .values({ orgId: DEMO_ORG_ID, userId: adminUserId, role: "admin" })
        .onConflictDoNothing();
    }
  });
}
