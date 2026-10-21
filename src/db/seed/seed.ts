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
import { DEMO_ORG_ID, DEMO_ORG_NAME, buildDemoData } from "./data";

type Database = PgDatabase<PgQueryResultHKT>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Inserts the demo rows for orgId. Rows that already exist are left alone. */
async function insertDemoData(tx: Transaction, orgId: string) {
  const data = buildDemoData(orgId);
  await tx.insert(properties).values(data.properties).onConflictDoNothing();
  await tx.insert(rooms).values(data.rooms).onConflictDoNothing();
  await tx.insert(tenants).values(data.tenants).onConflictDoNothing();
  await tx.insert(tenancies).values(data.tenancies).onConflictDoNothing();
  await tx.insert(tenancyTenants).values(data.tenancyTenants).onConflictDoNothing();
  await tx.insert(owners).values(data.owners).onConflictDoNothing();
  await tx.insert(propertyOwners).values(data.propertyOwners).onConflictDoNothing();
}

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
    await insertDemoData(tx, DEMO_ORG_ID);

    if (adminUserId) {
      await tx
        .insert(memberships)
        .values({ orgId: DEMO_ORG_ID, userId: adminUserId, role: "admin" })
        .onConflictDoNothing();
    }
  });
}

/**
 * Adds the demo properties, rooms, tenants and owners to an organisation that
 * already exists, in one transaction. Safe to run more than once.
 */
export async function seedDemoDataInto(db: Database, orgId: string) {
  await db.transaction(async (tx) => {
    await insertDemoData(tx, orgId);
  });
}
