// @vitest-environment node
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, demoId } from "./seed/data";
import { seedDemoDataInto, seedDemoOrg } from "./seed/seed";
import { createTestDatabase, type TestDatabase } from "./testing/pglite";

const ADMIN = "55555555-5555-4555-8555-555555555555";
const OUTSIDER = "66666666-6666-4666-8666-666666666666";

let t: TestDatabase;

async function count(table: string) {
  const { rows } = await t.db.query<{ total: number; in_demo_org: number }>(
    `select count(*)::int as total, count(*) filter (where org_id = $1)::int as in_demo_org from public.${table}`,
    [DEMO_ORG_ID],
  );
  return rows[0]!;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await t.createAuthUser(ADMIN, "admin@example.test");
  await t.createAuthUser(OUTSIDER, "outsider@example.test");
  const db = drizzle({ client: t.db });
  await seedDemoOrg(db, { adminUserId: ADMIN });
  // A second run must not duplicate anything.
  await seedDemoOrg(db, { adminUserId: ADMIN });
}, 60_000);

afterAll(async () => {
  await t.db.close();
});

describe("demo seed", () => {
  it.each([
    ["organisations", 1],
    ["properties", 3],
    ["rooms", 12],
    ["tenants", 8],
    ["tenancies", 8],
    ["tenancy_tenants", 8],
    ["owners", 2],
    ["property_owners", 2],
  ])("creates %s once, all in the demo org", async (table, expected) => {
    if (table === "organisations") {
      const { rows } = await t.db.query("select id from public.organisations");
      expect(rows).toEqual([{ id: DEMO_ORG_ID }]);
      return;
    }
    expect(await count(table)).toEqual({ total: expected, in_demo_org: expected });
  });

  it("gives every let room exactly one active tenancy, and no other room any", async () => {
    const { rows } = await t.db.query<{ status: string; current: number }>(
      `select r.status, count(t.id)::int as current
       from public.rooms r
       left join public.tenancies t on t.room_id = r.id and t.status = 'active'
       group by r.id, r.status`,
    );
    for (const row of rows) expect(row.current).toBe(row.status === "let" ? 1 : 0);
  });

  it("caps deposits at five weeks' rent", async () => {
    const { rows } = await t.db.query<{ over: number }>(
      "select count(*)::int as over from public.tenancies where deposit_pence > rent_pence * 12 * 5 / 52",
    );
    expect(rows).toEqual([{ over: 0 }]);
  });

  it("makes the chosen user an admin who can see the data through RLS", async () => {
    const seen = await t.asUser(ADMIN, async () => {
      const { rows } = await t.db.query<{ properties: number; rooms: number }>(
        "select (select count(*)::int from public.properties) as properties, (select count(*)::int from public.rooms) as rooms",
      );
      return rows[0];
    });
    expect(seen).toEqual({ properties: 3, rooms: 12 });
  });

  it("keeps the demo data hidden from everyone else", async () => {
    const seen = await t.asUser(OUTSIDER, async () => {
      const { rows } = await t.db.query("select id from public.rooms");
      return rows;
    });
    expect(seen).toEqual([]);
  });
});

describe("demo seed into an existing organisation", () => {
  const OWNER = "77777777-7777-4777-8777-777777777777";
  const NEIGHBOUR = "88888888-8888-4888-8888-888888888888";
  let db2: TestDatabase;
  let ownOrg: string;
  let neighbourOrg: string;

  beforeAll(async () => {
    db2 = await createTestDatabase();
    await db2.createAuthUser(OWNER, "owner@example.test");
    await db2.createAuthUser(NEIGHBOUR, "neighbour@example.test");
    ownOrg = await db2.createOrg(OWNER, "Own Lettings");
    neighbourOrg = await db2.createOrg(NEIGHBOUR, "Neighbour Lettings");
    const db = drizzle({ client: db2.db });
    await seedDemoDataInto(db, ownOrg);
    // A second run, and a second org, must not clash or duplicate anything.
    await seedDemoDataInto(db, ownOrg);
    await seedDemoDataInto(db, neighbourOrg);
  }, 60_000);

  afterAll(async () => {
    await db2.db.close();
  });

  it.each([
    ["properties", 3],
    ["rooms", 12],
    ["tenants", 8],
    ["tenancies", 8],
    ["tenancy_tenants", 8],
    ["owners", 2],
    ["property_owners", 2],
  ])("adds %s once to each organisation", async (table, expected) => {
    const { rows } = await db2.db.query<{ org_id: string; total: number }>(
      `select org_id, count(*)::int as total from public.${table} group by org_id order by org_id`,
    );
    expect(rows).toEqual(
      [ownOrg, neighbourOrg].sort().map((orgId) => ({ org_id: orgId, total: expected })),
    );
  });

  it("doesn't create the demo organisation", async () => {
    const { rows } = await db2.db.query("select id from public.organisations where id = $1", [
      DEMO_ORG_ID,
    ]);
    expect(rows).toEqual([]);
  });

  it("shows each organisation only its own copy", async () => {
    const seen = await db2.asUser(OWNER, async () => {
      const { rows } = await db2.db.query<{ org_id: string }>(
        "select distinct org_id from public.rooms",
      );
      return rows;
    });
    expect(seen).toEqual([{ org_id: ownOrg }]);
  });

  it("writes an audit row for each record it adds", async () => {
    const { rows } = await db2.db.query<{ total: number }>(
      "select count(*)::int as total from public.audit_log where org_id = $1 and table_name = 'rooms' and action = 'insert'",
      [ownOrg],
    );
    expect(rows).toEqual([{ total: 12 }]);
  });
});

describe("demoId", () => {
  it("is stable, UUID-shaped and different for each org", () => {
    const a = demoId(DEMO_ORG_ID, "room", 1);
    expect(a).toBe(demoId(DEMO_ORG_ID, "room", 1));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(demoId("11111111-1111-4111-8111-111111111111", "room", 1));
    expect(a).not.toBe(demoId(DEMO_ORG_ID, "room", 2));
  });
});
