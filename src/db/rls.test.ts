// @vitest-environment node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createTestDatabase,
  installSupabaseStubs,
  type TestDatabase,
} from "./testing/pglite";
import { todayInLondon } from "@/lib/format";

/**
 * Applies every migration to an in-memory Postgres (PGlite) with a minimal
 * stand-in for Supabase's auth schema and roles, then checks RLS behaviour.
 *
 * Alice is admin of org A, Carol is staff in org A, Dave was removed from
 * org A, and Bob is admin of org B.
 */

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CAROL = "33333333-3333-4333-8333-333333333333";
const DAVE = "44444444-4444-4444-8444-444444444444";

const BUSINESS_TABLES = [
  "properties",
  "rooms",
  "tenants",
  "tenancies",
  "tenancy_tenants",
  "owners",
  "property_owners",
  "documents",
  "onboarding_templates",
  "onboarding_template_steps",
  "onboardings",
  "onboarding_steps",
  "right_to_rent_checks",
  "reminders",
  "tenancy_guarantors",
  "signature_requests",
  "signature_request_signers",
  "esign_events",
  "tenant_portal_invites",
  "rent_charges",
  "rent_payments",
  "maintenance_requests",
  "maintenance_photos",
  "document_services",
] as const;

type BusinessTable = (typeof BUSINESS_TABLES)[number];
type RecordIds = Record<BusinessTable, string>;

/**
 * An insert for each business table. `parents` supplies the ids that the new
 * row points at, so a test can mix in another org's parents.
 */
const INSERTS: Record<
  BusinessTable,
  (orgId: string, parents: RecordIds) => { sql: string; params: unknown[] }
> = {
  properties: (orgId) => ({
    sql: "insert into public.properties (org_id, address_line_1, town, postcode, ownership_type) values ($1, '1 Test Street', 'Leeds', 'LS6 1AA', 'owned') returning id",
    params: [orgId],
  }),
  rooms: (orgId, parents) => ({
    sql: "insert into public.rooms (org_id, property_id, name, rent_pence) values ($1, $2, 'Room 1', 52000) returning id",
    params: [orgId, parents.properties],
  }),
  tenants: (orgId) => ({
    sql: "insert into public.tenants (org_id, first_name, last_name) values ($1, 'Test', 'Tenant') returning id",
    params: [orgId],
  }),
  tenancies: (orgId, parents) => ({
    sql: "insert into public.tenancies (org_id, room_id, start_date, rent_pence) values ($1, $2, '2026-09-01', 52000) returning id",
    params: [orgId, parents.rooms],
  }),
  tenancy_tenants: (orgId, parents) => ({
    sql: "insert into public.tenancy_tenants (org_id, tenancy_id, tenant_id) values ($1, $2, $3) returning id",
    params: [orgId, parents.tenancies, parents.tenants],
  }),
  owners: (orgId) => ({
    sql: "insert into public.owners (org_id, name) values ($1, 'Test Owner') returning id",
    params: [orgId],
  }),
  property_owners: (orgId, parents) => ({
    sql: "insert into public.property_owners (org_id, property_id, owner_id) values ($1, $2, $3) returning id",
    params: [orgId, parents.properties, parents.owners],
  }),
  documents: (orgId, parents) => ({
    sql: "insert into public.documents (org_id, document_type, file_path, file_name, property_id) values ($1, 'gas_safety', $1::uuid::text || '/gas-safety.pdf', 'gas-safety.pdf', $2) returning id",
    params: [orgId, parents.properties],
  }),
  onboarding_templates: (orgId) => ({
    sql: "insert into public.onboarding_templates (org_id, name) values ($1, 'Test workflow') returning id",
    params: [orgId],
  }),
  onboarding_template_steps: (orgId, parents) => ({
    sql: "insert into public.onboarding_template_steps (org_id, template_id, position, kind, title, applicant_title) values ($1, $2, 100 + floor(random() * 30000)::int, 'custom', 'Step', 'Step') returning id",
    params: [orgId, parents.onboarding_templates],
  }),
  onboardings: (orgId, parents) => ({
    sql: "insert into public.onboardings (org_id, room_id, tenancy_id, template_id, status) values ($1, $2, $3, $4, 'completed') returning id",
    params: [orgId, parents.rooms, parents.tenancies, parents.onboarding_templates],
  }),
  onboarding_steps: (orgId, parents) => ({
    sql: "insert into public.onboarding_steps (org_id, onboarding_id, position, kind, title, applicant_title) values ($1, $2, 100 + floor(random() * 30000)::int, 'custom', 'Step', 'Step') returning id",
    params: [orgId, parents.onboardings],
  }),
  right_to_rent_checks: (orgId, parents) => ({
    sql: "insert into public.right_to_rent_checks (org_id, tenant_id, check_date, method, permission) values ($1, $2, '2026-08-01', 'manual_documents', 'unlimited') returning id",
    params: [orgId, parents.tenants],
  }),
  reminders: (orgId, parents) => ({
    sql: "insert into public.reminders (org_id, kind, title, due_date, tenant_id) values ($1, 'other', 'Test reminder', '2026-12-01', $2) returning id",
    params: [orgId, parents.tenants],
  }),
  // Removed, cancelled and random keys avoid the one-per-tenancy rules in the parent-swap tests.
  tenancy_guarantors: (orgId, parents) => ({
    sql: "insert into public.tenancy_guarantors (org_id, tenancy_id, name, email, status, removed_at, removed_reason) values ($1, $2, 'Gary Guarantor', 'gary@example.test', 'removed', now(), 'Test') returning id",
    params: [orgId, parents.tenancies],
  }),
  signature_requests: (orgId, parents) => ({
    sql: "insert into public.signature_requests (org_id, tenancy_id, kind, provider, provider_request_id, status) values ($1, $2, 'tenancy_agreement', 'fake', gen_random_uuid()::text, 'cancelled') returning id",
    params: [orgId, parents.tenancies],
  }),
  signature_request_signers: (orgId, parents) => ({
    sql: "insert into public.signature_request_signers (org_id, request_id, role, name, email, signing_order) values ($1, $2, 'tenant', 'Test Tenant', 'tenant@example.test', 1 + floor(random() * 30000)::int) returning id",
    params: [orgId, parents.signature_requests],
  }),
  esign_events: (orgId, parents) => ({
    sql: "insert into public.esign_events (org_id, request_id, event_key, event_type) values ($1, $2, gen_random_uuid()::text, 'test') returning id",
    params: [orgId, parents.signature_requests],
  }),
  tenant_portal_invites: (orgId, parents) => ({
    sql: "insert into public.tenant_portal_invites (org_id, tenant_id, token_hash, expires_at) values ($1, $2, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), now() + interval '1 day') returning id",
    params: [orgId, parents.tenants],
  }),
  rent_charges: (orgId, parents) => ({
    sql: "insert into public.rent_charges (org_id, tenancy_id, due_date, amount_pence, description) values ($1, $2, '2026-09-01', 1000, 'Test charge') returning id",
    params: [orgId, parents.tenancies],
  }),
  rent_payments: (orgId, parents) => ({
    sql: "insert into public.rent_payments (org_id, tenancy_id, paid_on, amount_pence, method) values ($1, $2, '2026-09-01', 1000, 'bank_transfer') returning id",
    params: [orgId, parents.tenancies],
  }),
  maintenance_requests: (orgId, parents) => ({
    sql: "insert into public.maintenance_requests (org_id, property_id, title, description) values ($1, $2, 'Leaking tap', 'Drips all night') returning id",
    params: [orgId, parents.properties],
  }),
  maintenance_photos: (orgId, parents) => ({
    sql: "insert into public.maintenance_photos (org_id, request_id, file_path, file_name) values ($1, $2, $1::uuid::text || '/maintenance/' || $2::uuid::text || '/tap.jpg', 'tap.jpg') returning id",
    params: [orgId, parents.maintenance_requests],
  }),
  document_services: (orgId, parents) => ({
    sql: "insert into public.document_services (org_id, document_id, tenancy_id) values ($1, $2, $3) returning id",
    params: [orgId, parents.documents, parents.tenancies],
  }),
};

/** The business records each table's rows point at. */
const PARENTS: Record<BusinessTable, BusinessTable[]> = {
  properties: [],
  rooms: ["properties"],
  tenants: [],
  tenancies: ["rooms"],
  tenancy_tenants: ["tenancies", "tenants"],
  owners: [],
  property_owners: ["properties", "owners"],
  documents: ["properties"],
  onboarding_templates: [],
  onboarding_template_steps: ["onboarding_templates"],
  onboardings: ["rooms", "tenancies", "onboarding_templates"],
  onboarding_steps: ["onboardings"],
  right_to_rent_checks: ["tenants"],
  reminders: ["tenants"],
  tenancy_guarantors: ["tenancies"],
  signature_requests: ["tenancies"],
  signature_request_signers: ["signature_requests"],
  esign_events: ["signature_requests"],
  tenant_portal_invites: ["tenants"],
  rent_charges: ["tenancies"],
  rent_payments: ["tenancies"],
  maintenance_requests: ["properties"],
  maintenance_photos: ["maintenance_requests"],
  document_services: ["documents", "tenancies"],
};

let t: TestDatabase;
let db: PGlite;
let aliceOrg: string;
let bobOrg: string;
let aliceIds: RecordIds;
let bobIds: RecordIds;

/** Creates one row in every business table, as userId and through RLS. */
async function createRecords(userId: string, orgId: string): Promise<RecordIds> {
  return t.asUser(
    userId,
    async () => {
      const ids = {} as RecordIds;
      for (const table of BUSINESS_TABLES) {
        const { sql, params } = INSERTS[table](orgId, ids);
        const { rows } = await db.query<{ id: string }>(sql, params);
        ids[table] = rows[0]!.id;
      }
      await db.query("update public.tenancies set status = 'active' where id = $1", [
        ids.tenancies,
      ]);
      return ids;
    },
    true,
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;

  await t.createAuthUser(ALICE, "alice@example.test", "Alice Adams");
  await t.createAuthUser(BOB, "bob@example.test", "Bob Brown");
  await t.createAuthUser(CAROL, "carol@example.test", "Carol Clark");
  await t.createAuthUser(DAVE, "dave@example.test");
  aliceOrg = await t.createOrg(ALICE, "  Alice Lettings ");
  bobOrg = await t.createOrg(BOB, "Bob Homes");
  await db.query(
    "insert into public.memberships (org_id, user_id, role, status) values ($1, $2, 'staff', 'active'), ($1, $3, 'staff', 'removed')",
    [aliceOrg, CAROL, DAVE],
  );
  aliceIds = await createRecords(ALICE, aliceOrg);
  bobIds = await createRecords(BOB, bobOrg);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("row level security", () => {
  it("is enabled on every table in the public schema", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.relrowsecurity).map((row) => row.relname)).toEqual([]);
  });

  it("lets members see only their own organisation and membership", async () => {
    await t.asUser(ALICE, async () => {
      const orgs = await db.query<{ id: string; name: string }>(
        "select id, name from public.organisations",
      );
      expect(orgs.rows).toEqual([{ id: aliceOrg, name: "Alice Lettings" }]);

      const memberships = await db.query<{ user_id: string; role: string }>(
        "select user_id, role from public.memberships order by user_id",
      );
      expect(memberships.rows).toEqual([
        { user_id: ALICE, role: "admin" },
        { user_id: CAROL, role: "staff" },
        { user_id: DAVE, role: "staff" },
      ]);
    });
  });

  it("shows staff only their own membership", async () => {
    await t.asUser(CAROL, async () => {
      const { rows } = await db.query<{ user_id: string }>(
        "select user_id from public.memberships",
      );
      expect(rows).toEqual([{ user_id: CAROL }]);
    });
  });

  it("gives removed members no access to the organisation", async () => {
    await t.asUser(DAVE, async () => {
      const { rows } = await db.query("select id from public.organisations");
      expect(rows).toEqual([]);
    });
  });

  it("blocks direct writes from signed-in users", async () => {
    await expect(
      t.asUser(ALICE, () => db.query("insert into public.organisations (name) values ('Sneaky')")),
    ).rejects.toThrow(/row-level security/);

    await expect(
      t.asUser(ALICE, () =>
        db.query(
          "insert into public.memberships (org_id, user_id, role) values ($1, $2, 'admin')",
          [bobOrg, ALICE],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    await t.asUser(ALICE, async () => {
      const update = await db.query(
        "update public.organisations set name = 'Hacked' where id = $1",
        [bobOrg],
      );
      expect(update.affectedRows).toBe(0);
      const remove = await db.query("delete from public.memberships");
      expect(remove.affectedRows).toBe(0);
    });
  });

  it("gives signed-out visitors no access", async () => {
    for (const table of ["organisations", "users", "memberships", "audit_log"]) {
      await expect(t.asAnon(() => db.query(`select * from public.${table}`))).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      t.asAnon(() => db.query("select public.create_organisation('Nope')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("user profiles", () => {
  it("are created from the auth user", async () => {
    const { rows } = await db.query<{ email: string; full_name: string }>(
      "select email, full_name from public.users where id = $1",
      [ALICE],
    );
    expect(rows).toEqual([{ email: "alice@example.test", full_name: "Alice Adams" }]);
  });

  it("follow email changes", async () => {
    await db.exec("begin");
    await db.query("update auth.users set email = 'alice@new.example.test' where id = $1", [ALICE]);
    const { rows } = await db.query<{ email: string }>(
      "select email from public.users where id = $1",
      [ALICE],
    );
    await db.exec("rollback");
    expect(rows).toEqual([{ email: "alice@new.example.test" }]);
  });

  it("are visible only to people who share an active organisation", async () => {
    const visibleTo = (userId: string) =>
      t.asUser(userId, async () => {
        const { rows } = await db.query<{ id: string }>("select id from public.users order by id");
        return rows.map((row) => row.id);
      });

    expect(await visibleTo(ALICE)).toEqual([ALICE, CAROL]);
    expect(await visibleTo(CAROL)).toEqual([ALICE, CAROL]);
    expect(await visibleTo(BOB)).toEqual([BOB]);
    expect(await visibleTo(DAVE)).toEqual([DAVE]);
  });

  it("let users change only their own name", async () => {
    await t.asUser(ALICE, async () => {
      const own = await db.query("update public.users set full_name = 'Alice A' where id = $1", [
        ALICE,
      ]);
      expect(own.affectedRows).toBe(1);
      const other = await db.query("update public.users set full_name = 'Hacked' where id = $1", [
        CAROL,
      ]);
      expect(other.affectedRows).toBe(0);
    });

    await expect(
      t.asUser(ALICE, () =>
        db.query("update public.users set email = 'x@example.test' where id = $1", [ALICE]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("create_organisation", () => {
  it("requires a signed-in user", async () => {
    await expect(
      t.asUser(null, () => db.query("select public.create_organisation('Nope')")),
    ).rejects.toThrow(/Not signed in/);
  });

  it("rejects names that are too short", async () => {
    await expect(
      t.asUser(ALICE, () => db.query("select public.create_organisation('A')")),
    ).rejects.toThrow(/between 2 and 120/);
  });
});

describe("audit log", () => {
  it("records who created the organisation and membership", async () => {
    await t.asUser(ALICE, async () => {
      const { rows } = await db.query<{
        table_name: string;
        action: string;
        actor_user_id: string | null;
      }>(
        "select table_name, action, actor_user_id from public.audit_log where table_name in ('organisations', 'memberships') and actor_user_id is not null order by table_name",
      );
      expect(rows).toEqual([
        { table_name: "memberships", action: "insert", actor_user_id: ALICE },
        { table_name: "organisations", action: "insert", actor_user_id: ALICE },
      ]);
    });
  });

  it("is hidden from staff", async () => {
    await t.asUser(CAROL, async () => {
      const { rows } = await db.query("select id from public.audit_log");
      expect(rows).toEqual([]);
    });
  });

  it("cannot be written to by users", async () => {
    await expect(
      t.asUser(ALICE, () =>
        db.query(
          "insert into public.audit_log (org_id, table_name, record_id, action) values ($1, 'x', $1, 'insert')",
          [aliceOrg],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("stores before and after values for updates", async () => {
    await db.query("update public.organisations set name = 'Alice Lettings Ltd' where id = $1", [
      aliceOrg,
    ]);
    const { rows } = await db.query<{ before: string; after: string }>(
      "select before->>'name' as before, after->>'name' as after from public.audit_log where action = 'update' and record_id = $1",
      [aliceOrg],
    );
    expect(rows).toEqual([{ before: "Alice Lettings", after: "Alice Lettings Ltd" }]);
  });
});

describe.each(BUSINESS_TABLES)("%s: org isolation", (table) => {
  it("shows a member only their own organisation's rows", async () => {
    await t.asUser(ALICE, async () => {
      const { rows } = await db.query<{ id: string; org_id: string }>(
        `select id, org_id from public.${table}`,
      );
      // Some tables also hold rows every org gets, such as the default onboarding workflow.
      expect(rows.map((row) => row.id)).toContain(aliceIds[table]);
      expect(rows.every((row) => row.org_id === aliceOrg)).toBe(true);
    });
  });

  it("does not let a member edit another organisation's rows", async () => {
    await t.asUser(ALICE, async () => {
      const update = await db.query(`update public.${table} set updated_at = now() where id = $1`, [
        bobIds[table],
      ]);
      expect(update.affectedRows).toBe(0);
    });
    const { rows } = await db.query<{ changed: boolean }>(
      `select updated_at <> created_at as changed from public.${table} where id = $1`,
      [bobIds[table]],
    );
    expect(rows).toEqual([{ changed: false }]);
  });

  it("does not let a member add rows to another organisation", async () => {
    const { sql, params } = INSERTS[table](bobOrg, bobIds);
    await expect(t.asUser(ALICE, () => db.query(sql, params))).rejects.toThrow(
      /row-level security/,
    );
  });

  it.runIf(PARENTS[table].length > 0)(
    "does not let a member link their rows to another organisation's records",
    async () => {
      for (const parent of PARENTS[table]) {
        const { sql, params } = INSERTS[table](aliceOrg, { ...aliceIds, [parent]: bobIds[parent] });
        await expect(t.asUser(ALICE, () => db.query(sql, params))).rejects.toThrow(/foreign key/);
      }
    },
  );

  it("does not let rows move to another organisation", async () => {
    await expect(
      t.asUser(ALICE, () =>
        db.query(`update public.${table} set org_id = $1 where id = $2`, [bobOrg, aliceIds[table]]),
      ),
    ).rejects.toThrow(/another organisation|row-level security/);

    // The trigger stops it even for the database owner.
    await expect(
      db.query(`update public.${table} set org_id = $1 where id = $2`, [bobOrg, aliceIds[table]]),
    ).rejects.toThrow(/cannot move to another organisation/);
  });

  it("never allows rows to be deleted", async () => {
    await expect(
      t.asUser(ALICE, () =>
        db.query(`delete from public.${table} where id = $1`, [aliceIds[table]]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.query(`delete from public.${table} where id = $1`, [aliceIds[table]]),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it("gives signed-out visitors no access", async () => {
    await expect(t.asAnon(() => db.query(`select * from public.${table}`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("gives removed members no access", async () => {
    await t.asUser(DAVE, async () => {
      const { rows } = await db.query(`select id from public.${table}`);
      expect(rows).toEqual([]);
    });
  });

  it("gives staff the same access as admins", async () => {
    await t.asUser(CAROL, async () => {
      const { rows } = await db.query<{ id: string; org_id: string }>(
        `select id, org_id from public.${table}`,
      );
      expect(rows.map((row) => row.id)).toContain(aliceIds[table]);
      expect(rows.every((row) => row.org_id === aliceOrg)).toBe(true);
      const update = await db.query(`update public.${table} set updated_at = now() where id = $1`, [
        aliceIds[table],
      ]);
      expect(update.affectedRows).toBe(1);
    });
  });
});

describe("business rules", () => {
  /** Runs a statement as Alice, then rolls it back. */
  function insertAsAlice(sql: string, params: unknown[]) {
    return t.asUser(ALICE, () => db.query(sql, params));
  }

  it("rejects negative rent", async () => {
    await expect(
      insertAsAlice(
        "insert into public.rooms (org_id, property_id, name, rent_pence) values ($1, $2, 'Bad', -1)",
        [aliceOrg, aliceIds.properties],
      ),
    ).rejects.toThrow(/rooms_rent_pence_not_negative/);
  });

  it("rejects badly formatted postcodes", async () => {
    await expect(
      insertAsAlice(
        "insert into public.properties (org_id, address_line_1, town, postcode, ownership_type) values ($1, '1 Road', 'Leeds', 'ls6 1aa', 'owned')",
        [aliceOrg],
      ),
    ).rejects.toThrow(/properties_postcode_format/);
  });

  it("rejects a rent due day outside 1 to 31", async () => {
    await expect(
      insertAsAlice(
        "insert into public.tenancies (org_id, room_id, start_date, rent_pence, rent_due_day) values ($1, $2, '2026-09-01', 50000, 0)",
        [aliceOrg, aliceIds.rooms],
      ),
    ).rejects.toThrow(/tenancies_rent_due_day_range/);
  });

  it("rejects a tenancy that ends before it starts", async () => {
    await expect(
      insertAsAlice(
        "insert into public.tenancies (org_id, room_id, start_date, end_date, rent_pence) values ($1, $2, '2026-09-01', '2026-08-31', 50000)",
        [aliceOrg, aliceIds.rooms],
      ),
    ).rejects.toThrow(/tenancies_dates_in_order/);
  });

  it("allows only one current tenancy per room", async () => {
    await expect(
      insertAsAlice(
        "insert into public.tenancies (org_id, room_id, start_date, rent_pence, status) values ($1, $2, '2026-10-01', 50000, 'active')",
        [aliceOrg, aliceIds.rooms],
      ),
    ).rejects.toThrow(/tenancies_one_current_per_room/);

    // A prospective tenancy for the next tenant is fine.
    await expect(
      insertAsAlice(
        "insert into public.tenancies (org_id, room_id, start_date, rent_pence) values ($1, $2, '2027-09-01', 50000)",
        [aliceOrg, aliceIds.rooms],
      ),
    ).resolves.toBeDefined();
  });

  it("links each document to exactly one record", async () => {
    const insertDocument = (propertyId: string | null, roomId: string | null) =>
      insertAsAlice(
        "insert into public.documents (org_id, document_type, file_path, file_name, property_id, room_id) values ($1, 'epc', $1::uuid::text || '/epc.pdf', 'epc.pdf', $2, $3)",
        [aliceOrg, propertyId, roomId],
      );
    await expect(insertDocument(aliceIds.properties, aliceIds.rooms)).rejects.toThrow(
      /documents_linked_to_one_record/,
    );
    await expect(insertDocument(null, null)).rejects.toThrow(/documents_linked_to_one_record/);
  });

  it("keeps document files inside the organisation's folder", async () => {
    await expect(
      insertAsAlice(
        "insert into public.documents (org_id, document_type, file_path, file_name, property_id) values ($1, 'epc', $3 || '/epc.pdf', 'epc.pdf', $2)",
        [aliceOrg, aliceIds.properties, bobOrg],
      ),
    ).rejects.toThrow(/documents_file_path_in_org_folder/);
  });

  it("records changes to business rows in the audit log", async () => {
    await t.asUser(ALICE, async () => {
      await db.query("update public.rooms set rent_pence = 55000 where id = $1", [aliceIds.rooms]);
      const { rows } = await db.query<{
        org_id: string;
        actor_user_id: string;
        before: number;
        after: number;
      }>(
        "select org_id, actor_user_id, (before->>'rent_pence')::int as before, (after->>'rent_pence')::int as after from public.audit_log where table_name = 'rooms' and action = 'update' and before->'rent_pence' is distinct from after->'rent_pence'",
      );
      expect(rows).toEqual([
        { org_id: aliceOrg, actor_user_id: ALICE, before: 52000, after: 55000 },
      ]);
    });
  });
});

describe("create_property", () => {
  type PropertyInput = {
    p_org_id: string;
    p_address_line_1: string;
    p_address_line_2: string | null;
    p_town: string;
    p_postcode: string;
    p_council: string | null;
    p_property_type: string;
    p_letting_type: string;
    p_room_count: number;
    p_room_rent_pence: number | null;
    p_ownership_type: string;
    p_head_rent_pence: number | null;
    p_owner_id: string | null;
    p_new_owner_name: string | null;
    p_new_owner_email: string | null;
    p_new_owner_phone: string | null;
    p_tags: string[];
  };

  const sixRoomHmo = (orgId: string): PropertyInput => ({
    p_org_id: orgId,
    p_address_line_1: "7 Wizard Way",
    p_address_line_2: null,
    p_town: "Leeds",
    p_postcode: "LS6 2AB",
    p_council: "Leeds",
    p_property_type: "house",
    p_letting_type: "house_share",
    p_room_count: 6,
    p_room_rent_pence: null,
    p_ownership_type: "owned",
    p_head_rent_pence: null,
    p_owner_id: null,
    p_new_owner_name: null,
    p_new_owner_email: null,
    p_new_owner_phone: null,
    p_tags: ["students"],
  });

  /** Calls create_property with named arguments. Runs inside the caller's transaction. */
  async function createProperty(input: PropertyInput) {
    const names = Object.keys(input);
    const args = names.map((name, index) => `${name} => $${index + 1}`).join(", ");
    const { rows } = await db.query<{ id: string }>(
      `select public.create_property(${args}) as id`,
      Object.values(input),
    );
    return rows[0]!.id;
  }

  it("creates a house share with rooms named Room 1 to Room N, and audits every row", async () => {
    await t.asUser(ALICE, async () => {
      const id = await createProperty(sixRoomHmo(aliceOrg));

      const property = await db.query(
        "select letting_type, bedrooms, tags from public.properties where id = $1",
        [id],
      );
      expect(property.rows).toEqual([
        { letting_type: "house_share", bedrooms: 6, tags: ["students"] },
      ]);

      const rooms = await db.query<{ name: string; rent_pence: number | null; status: string }>(
        "select name, rent_pence, status from public.rooms where property_id = $1 order by created_at, name",
        [id],
      );
      expect(rooms.rows.map((room) => room.name).sort()).toEqual(
        ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5", "Room 6"].sort(),
      );
      expect(
        rooms.rows.every((room) => room.rent_pence === null && room.status === "available"),
      ).toBe(true);

      const audit = await db.query<{ table_name: string; total: number }>(
        `select table_name, count(*)::int as total from public.audit_log
         where action = 'insert' and actor_user_id = $1
           and (record_id = $2 or (after->>'property_id')::uuid = $2)
         group by table_name order by table_name`,
        [ALICE, id],
      );
      expect(audit.rows).toEqual([
        { table_name: "properties", total: 1 },
        { table_name: "rooms", total: 6 },
      ]);
    });
  });

  it("creates one 'Whole property' unit for a single let", async () => {
    await t.asUser(ALICE, async () => {
      const id = await createProperty({
        ...sixRoomHmo(aliceOrg),
        p_letting_type: "single_let",
        p_room_count: 3,
        p_room_rent_pence: 125000,
      });
      const rooms = await db.query(
        "select name, rent_pence from public.rooms where property_id = $1",
        [id],
      );
      expect(rooms.rows).toEqual([{ name: "Whole property", rent_pence: 125000 }]);
    });
  });

  it("adds a new owner and links them to a managed property", async () => {
    await t.asUser(ALICE, async () => {
      const id = await createProperty({
        ...sixRoomHmo(aliceOrg),
        p_ownership_type: "managed",
        p_new_owner_name: "Jean Hollis",
        p_new_owner_email: "jean@example.test",
      });
      const { rows } = await db.query(
        `select o.name, o.email, o.org_id from public.property_owners po
         join public.owners o on o.id = po.owner_id where po.property_id = $1`,
        [id],
      );
      expect(rows).toEqual([{ name: "Jean Hollis", email: "jean@example.test", org_id: aliceOrg }]);
    });
  });

  it("links an existing owner from the same organisation, never another one's", async () => {
    await t.asUser(ALICE, async () => {
      const id = await createProperty({
        ...sixRoomHmo(aliceOrg),
        p_ownership_type: "master_lease",
        p_head_rent_pence: 180000,
        p_owner_id: aliceIds.owners,
      });
      const { rows } = await db.query(
        "select owner_id from public.property_owners where property_id = $1",
        [id],
      );
      expect(rows).toEqual([{ owner_id: aliceIds.owners }]);
    });

    await expect(
      t.asUser(ALICE, () =>
        createProperty({
          ...sixRoomHmo(aliceOrg),
          p_ownership_type: "managed",
          p_owner_id: bobIds.owners,
        }),
      ),
    ).rejects.toThrow(/property_owners_owner_fk/);
  });

  it("lets staff add properties to their organisation", async () => {
    await expect(t.asUser(CAROL, () => createProperty(sixRoomHmo(aliceOrg)))).resolves.toEqual(
      expect.any(String),
    );
  });

  it("does not let anyone add a property to another organisation", async () => {
    await expect(t.asUser(BOB, () => createProperty(sixRoomHmo(aliceOrg)))).rejects.toThrow(
      /row-level security/,
    );
    await expect(t.asUser(DAVE, () => createProperty(sixRoomHmo(aliceOrg)))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("is not available to signed-out visitors", async () => {
    await expect(t.asAnon(() => createProperty(sixRoomHmo(aliceOrg)))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each<[string, Partial<PropertyInput>, RegExp]>([
    ["no rooms", { p_room_count: 0 }, /between 1 and 50/],
    ["too many rooms", { p_room_count: 51 }, /between 1 and 50/],
    ["a managed property without an owner", { p_ownership_type: "managed" }, /needs an owner/],
    ["an owner on a property you own", { p_new_owner_name: "Someone" }, /no separate owner/],
    [
      "a master lease without a head rent",
      { p_ownership_type: "master_lease" },
      /properties_master_lease_has_head_rent/,
    ],
    ["a head rent without a master lease", { p_head_rent_pence: 1000 }, /Only a master lease/],
    [
      "both an existing and a new owner",
      {
        p_ownership_type: "managed",
        p_owner_id: "00000000-0000-4000-8000-000000000000",
        p_new_owner_name: "X",
      },
      /not both/,
    ],
  ])("rejects %s", async (_label, overrides, error) => {
    await expect(
      t.asUser(ALICE, () => createProperty({ ...sixRoomHmo(aliceOrg), ...overrides })),
    ).rejects.toThrow(error);
  });
});

describe("property hub", () => {
  type OwnershipInput = {
    p_property_id: string;
    p_ownership_type: string;
    p_head_rent_pence?: number | null;
    p_owner_id?: string | null;
    p_new_owner_name?: string | null;
  };

  /** Calls set_property_ownership with named arguments. */
  async function setOwnership(input: OwnershipInput) {
    const args = {
      p_head_rent_pence: null,
      p_owner_id: null,
      p_new_owner_name: null,
      p_new_owner_email: null,
      p_new_owner_phone: null,
      ...input,
    };
    const named = Object.keys(args)
      .map((name, index) => `${name} => $${index + 1}`)
      .join(", ");
    await db.query(`select public.set_property_ownership(${named})`, Object.values(args));
  }

  async function activeOwners(propertyId: string) {
    const { rows } = await db.query<{ owner_id: string }>(
      "select owner_id from public.property_owners where property_id = $1 and status = 'active' order by owner_id",
      [propertyId],
    );
    return rows.map((row) => row.owner_id);
  }

  it("gives properties empty details by default", async () => {
    const { rows } = await db.query(
      "select description, amenities, house_rules, bills_included from public.properties where id = $1",
      [aliceIds.properties],
    );
    expect(rows).toEqual([
      { description: null, amenities: [], house_rules: null, bills_included: false },
    ]);
  });

  it("won't archive a room with a current tenancy, but will once it has ended", async () => {
    await expect(
      t.asUser(ALICE, () =>
        db.query("update public.rooms set status = 'archived' where id = $1", [aliceIds.rooms]),
      ),
    ).rejects.toThrow(/current tenancy/);

    await t.asUser(ALICE, async () => {
      await db.query(
        "update public.tenancies set status = 'ending', end_date = start_date, end_reason = 'tenant_notice' where id = $1",
        [aliceIds.tenancies],
      );
      await db.query("update public.tenancies set status = 'ended' where id = $1", [
        aliceIds.tenancies,
      ]);
      await db.query("update public.rooms set status = 'archived' where id = $1", [aliceIds.rooms]);
      const { rows } = await db.query("select status from public.rooms where id = $1", [
        aliceIds.rooms,
      ]);
      expect(rows).toEqual([{ status: "archived" }]);
    });
  });

  it("switches owners by removing the old link, and brings it back when chosen again", async () => {
    await t.asUser(ALICE, async () => {
      const property = aliceIds.properties;
      await setOwnership({
        p_property_id: property,
        p_ownership_type: "managed",
        p_new_owner_name: "Second Owner",
      });
      const [second] = await activeOwners(property);
      expect(second).toBeDefined();
      expect(second).not.toBe(aliceIds.owners);

      // The first owner (linked in createRecords) was replaced, not deleted.
      const { rows } = await db.query(
        "select status from public.property_owners where property_id = $1 and owner_id = $2",
        [property, aliceIds.owners],
      );
      expect(rows).toEqual([{ status: "removed" }]);

      await setOwnership({
        p_property_id: property,
        p_ownership_type: "master_lease",
        p_head_rent_pence: 150000,
        p_owner_id: aliceIds.owners,
      });
      expect(await activeOwners(property)).toEqual([aliceIds.owners]);
      const held = await db.query(
        "select ownership_type, head_rent_pence from public.properties where id = $1",
        [property],
      );
      expect(held.rows).toEqual([{ ownership_type: "master_lease", head_rent_pence: 150000 }]);

      await setOwnership({ p_property_id: property, p_ownership_type: "owned" });
      expect(await activeOwners(property)).toEqual([]);
    });
  });

  it("checks ownership rules", async () => {
    const attempt = (input: OwnershipInput) => t.asUser(ALICE, () => setOwnership(input));
    await expect(
      attempt({ p_property_id: aliceIds.properties, p_ownership_type: "managed" }),
    ).rejects.toThrow(/needs an owner/);
    await expect(
      attempt({ p_property_id: aliceIds.properties, p_ownership_type: "master_lease" }),
    ).rejects.toThrow(/properties_master_lease_has_head_rent/);
    await expect(
      attempt({
        p_property_id: aliceIds.properties,
        p_ownership_type: "managed",
        p_owner_id: bobIds.owners,
      }),
    ).rejects.toThrow(/property_owners_owner_fk/);
  });

  it("doesn't let another organisation change ownership", async () => {
    await expect(
      t.asUser(BOB, () =>
        setOwnership({ p_property_id: aliceIds.properties, p_ownership_type: "owned" }),
      ),
    ).rejects.toThrow(/Property not found/);
    await expect(
      t.asAnon(() =>
        db.query(
          "select public.set_property_ownership($1, 'owned', null, null, null, null, null)",
          [aliceIds.properties],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("shows a property's activity to admins, with who made each change", async () => {
    await t.asUser(ALICE, async () => {
      await db.query("update public.rooms set rent_pence = 61000 where property_id = $1", [
        aliceIds.properties,
      ]);
      const { rows } = await db.query<{ table_name: string; action: string; actor_name: string }>(
        "select table_name, action, actor_name from public.property_activity($1)",
        [aliceIds.properties],
      );
      expect(rows[0]).toEqual({ table_name: "rooms", action: "update", actor_name: "Alice Adams" });
      const tables = new Set(rows.map((row) => row.table_name));
      for (const table of [
        "properties",
        "rooms",
        "tenancies",
        "tenancy_tenants",
        "property_owners",
        "documents",
      ]) {
        expect(tables).toContain(table);
      }
    });
  });

  it("shows activity to nobody else", async () => {
    for (const user of [CAROL, BOB, DAVE]) {
      const rows = await t.asUser(user, async () => {
        const result = await db.query("select * from public.property_activity($1)", [
          aliceIds.properties,
        ]);
        return result.rows;
      });
      expect(rows).toEqual([]);
    }
    await expect(
      t.asAnon(() => db.query("select * from public.property_activity($1)", [aliceIds.properties])),
    ).rejects.toThrow(/permission denied/);
  });

  describe("document storage", () => {
    const upload = (path: string) =>
      db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [path]);

    it("is a private bucket with a size limit and safe file types", async () => {
      const { rows } = await db.query(
        "select public, file_size_limit::int as limit, 'application/pdf' = any(allowed_mime_types) as pdf, 'text/html' = any(allowed_mime_types) as html from storage.buckets where id = 'documents'",
      );
      expect(rows).toEqual([{ public: false, limit: 20971520, pdf: true, html: false }]);
    });

    it("lets members upload only into their own organisation's folder", async () => {
      await t.asUser(CAROL, () => upload(`${aliceOrg}/properties/x/gas.pdf`));
      await expect(t.asUser(ALICE, () => upload(`${bobOrg}/properties/x/gas.pdf`))).rejects.toThrow(
        /row-level security/,
      );
      await expect(t.asUser(ALICE, () => upload("not-an-org/gas.pdf"))).rejects.toThrow(
        /row-level security/,
      );
      await expect(
        t.asUser(DAVE, () => upload(`${aliceOrg}/properties/x/gas.pdf`)),
      ).rejects.toThrow(/row-level security/);
    });

    it("shows files only to their organisation, and never deletes or replaces them", async () => {
      const path = `${aliceOrg}/properties/x/eicr.pdf`;
      await t.asUser(ALICE, () => upload(path), true);

      const seenBy = (user: string) =>
        t.asUser(user, async () => {
          const { rows } = await db.query<{ name: string }>(
            "select name from storage.objects where bucket_id = 'documents'",
          );
          return rows.map((row) => row.name);
        });
      expect(await seenBy(ALICE)).toContain(path);
      expect(await seenBy(BOB)).toEqual([]);

      await t.asUser(ALICE, async () => {
        expect((await db.query("delete from storage.objects")).affectedRows).toBe(0);
        expect(
          (await db.query("update storage.objects set name = 'swapped.pdf'")).affectedRows,
        ).toBe(0);
      });
      const anon = await t.asAnon(
        async () => (await db.query("select name from storage.objects")).rows,
      );
      expect(anon).toEqual([]);
    });
  });
});

describe("tenancies", () => {
  const today = todayInLondon();
  const daysFromToday = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  /** A fresh, available room in Alice's org (inside the current transaction). */
  async function newRoom() {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Test room') returning id",
      [aliceOrg, aliceIds.properties],
    );
    return rows[0]!.id;
  }

  async function roomStatus(roomId: string) {
    const { rows } = await db.query<{ status: string }>(
      "select status from public.rooms where id = $1",
      [roomId],
    );
    return rows[0]!.status;
  }

  /** A raw insert, to test the table's own rules. */
  function insertTenancy(roomId: string, status: string, extra = "") {
    const ending = status === "ending" || status === "ended";
    return db.query(
      `insert into public.tenancies (org_id, room_id, start_date, status, rent_pence${
        ending ? ", end_date, end_reason" : ""
      }) values ($1, $2, '2026-06-01', $3, 50000${ending ? ", '2026-12-01', 'tenant_notice'" : ""}) ${extra}`,
      [aliceOrg, roomId, status],
    );
  }

  type TenancyInput = {
    p_room_id: string;
    p_start_date: string;
    p_rent_pence?: number;
    p_rent_frequency?: string;
    p_rent_due_day?: number;
    p_deposit_pence?: number;
  };

  async function createTenancy(input: TenancyInput) {
    const args = {
      p_first_name: "Jo",
      p_last_name: "Tenant",
      p_email: "jo@example.test",
      p_phone: null,
      p_rent_pence: 55000,
      p_rent_frequency: "monthly",
      p_rent_due_day: 1,
      p_deposit_pence: 0,
      ...input,
    };
    const named = Object.keys(args)
      .map((name, index) => `${name} => $${index + 1}`)
      .join(", ");
    const { rows } = await db.query<{ id: string }>(
      `select public.create_tenancy(${named}) as id`,
      Object.values(args),
    );
    return rows[0]!.id;
  }

  async function tenancy(id: string) {
    const { rows } = await db.query<{
      status: string;
      end_date: string | null;
      notice_date: string | null;
    }>(
      "select status, to_char(end_date, 'YYYY-MM-DD') as end_date, to_char(notice_date, 'YYYY-MM-DD') as notice_date from public.tenancies where id = $1",
      [id],
    );
    return rows[0]!;
  }

  const notice = (id: string, noticeDate: string, endDate: string, reason = "tenant_notice") =>
    db.query("select public.give_tenancy_notice($1, $2, $3, $4)", [
      id,
      reason,
      noticeDate,
      endDate,
    ]);
  const call = (fn: string, id: string) => db.query(`select public.${fn}($1)`, [id]);

  describe("one active tenancy per room", () => {
    it("refuses a second active tenancy", async () => {
      await expect(
        t.asUser(ALICE, async () => {
          const room = await newRoom();
          await insertTenancy(room, "active");
          await insertTenancy(room, "active");
        }),
      ).rejects.toThrow(/tenancies_one_current_per_room/);
    });

    it("counts a tenancy that's ending as current", async () => {
      await expect(
        t.asUser(ALICE, async () => {
          const room = await newRoom();
          await insertTenancy(room, "ending");
          await insertTenancy(room, "active");
        }),
      ).rejects.toThrow(/tenancies_one_current_per_room/);
    });

    it("allows one upcoming tenancy alongside the current one, but not two", async () => {
      await expect(
        t.asUser(ALICE, async () => {
          const room = await newRoom();
          await insertTenancy(room, "active");
          await insertTenancy(room, "prospective");
          await insertTenancy(room, "prospective");
        }),
      ).rejects.toThrow(/tenancies_one_upcoming_per_room/);
    });

    it("keeps any number of past tenancies alongside a current one", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        await insertTenancy(room, "ended");
        await insertTenancy(room, "ended");
        await insertTenancy(room, "cancelled");
        await insertTenancy(room, "active");
        await insertTenancy(room, "prospective");
        const { rows } = await db.query(
          "select count(*)::int as n from public.tenancies where room_id = $1",
          [room],
        );
        expect(rows).toEqual([{ n: 5 }]);
      });
    });

    it("applies per room, not per property", async () => {
      await t.asUser(ALICE, async () => {
        await insertTenancy(await newRoom(), "active");
        await insertTenancy(await newRoom(), "active");
      });
    });
  });

  describe("create_tenancy", () => {
    it("lets a room from today: periodic, no end date, and the room becomes Let", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        const id = await createTenancy({ p_room_id: room, p_start_date: today });
        expect(await tenancy(id)).toEqual({ status: "active", end_date: null, notice_date: null });
        expect(await roomStatus(room)).toBe("let");

        const { rows } = await db.query(
          `select tn.first_name, tn.org_id from public.tenancy_tenants tt
           join public.tenants tn on tn.id = tt.tenant_id where tt.tenancy_id = $1`,
          [id],
        );
        expect(rows).toEqual([{ first_name: "Jo", org_id: aliceOrg }]);

        const audit = await db.query(
          "select count(*)::int as n from public.audit_log where actor_user_id = $1 and record_id = $2 and action = 'insert'",
          [ALICE, id],
        );
        expect(audit.rows).toEqual([{ n: 1 }]);
      });
    });

    it("makes a future tenancy upcoming and leaves the room available", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        const id = await createTenancy({ p_room_id: room, p_start_date: daysFromToday(30) });
        expect((await tenancy(id)).status).toBe("prospective");
        expect(await roomStatus(room)).toBe("available");
      });
    });

    it("explains clashes with the current and upcoming tenancies", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        const current = await createTenancy({ p_room_id: room, p_start_date: today });
        await db.query("savepoint s");
        await expect(createTenancy({ p_room_id: room, p_start_date: today })).rejects.toThrow(
          /already has a current tenancy/,
        );
        await db.query("rollback to savepoint s");

        await notice(current, today, daysFromToday(60));
        await expect(
          createTenancy({ p_room_id: room, p_start_date: daysFromToday(30) }),
        ).rejects.toThrow(/Choose a start date on or after that day/);
        await db.query("rollback to savepoint s");

        await notice(current, today, daysFromToday(60));
        await createTenancy({ p_room_id: room, p_start_date: daysFromToday(60) });
        await expect(
          createTenancy({ p_room_id: room, p_start_date: daysFromToday(90) }),
        ).rejects.toThrow(/already has an upcoming tenancy/);
      });
    });

    it.each([
      ["monthly", 55000, 63461],
      ["weekly", 13000, 65000],
      // £4,200 a month is £50,400 a year, so the cap is six weeks.
      ["monthly", 420000, 581538],
    ])("caps the deposit for %s rent of %i pence at %i", async (frequency, rent, cap) => {
      const attempt = (deposit: number) =>
        t.asUser(ALICE, async () =>
          createTenancy({
            p_room_id: await newRoom(),
            p_start_date: today,
            p_rent_frequency: frequency,
            p_rent_pence: rent,
            p_deposit_pence: deposit,
          }),
        );
      await expect(attempt(cap)).resolves.toEqual(expect.any(String));
      await expect(attempt(cap + 1)).rejects.toThrow(/tenancies_deposit_within_cap/);
    });

    it("takes monthly or weekly rent, with a weekday for weekly rent", async () => {
      const attempt = (frequency: string, dueDay: number) =>
        t.asUser(ALICE, async () =>
          createTenancy({
            p_room_id: await newRoom(),
            p_start_date: today,
            p_rent_frequency: frequency,
            p_rent_pence: 13000,
            p_rent_due_day: dueDay,
          }),
        );
      await expect(attempt("weekly", 5)).resolves.toEqual(expect.any(String));
      await expect(attempt("weekly", 8)).rejects.toThrow(/tenancies_weekly_due_day_is_weekday/);
      await expect(attempt("fortnightly", 1)).rejects.toThrow(/tenancies_rent_monthly_or_weekly/);
    });

    it("won't let an archived room", async () => {
      await expect(
        t.asUser(ALICE, async () => {
          const room = await newRoom();
          await db.query("update public.rooms set status = 'archived' where id = $1", [room]);
          await createTenancy({ p_room_id: room, p_start_date: today });
        }),
      ).rejects.toThrow(/archived/);
    });
  });

  describe("ending, moving in and cancelling", () => {
    it("goes from current to ending to ended, freeing the room", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        const id = await createTenancy({ p_room_id: room, p_start_date: daysFromToday(-90) });
        await notice(id, daysFromToday(-60), today);
        expect(await tenancy(id)).toEqual({
          status: "ending",
          notice_date: daysFromToday(-60),
          end_date: today,
        });
        expect(await roomStatus(room)).toBe("let");

        await call("end_tenancy", id);
        expect((await tenancy(id)).status).toBe("ended");
        expect(await roomStatus(room)).toBe("available");
      });
    });

    it("waits for the end date before marking a tenancy ended", async () => {
      await expect(
        t.asUser(ALICE, async () => {
          const id = await createTenancy({ p_room_id: await newRoom(), p_start_date: today });
          await notice(id, today, daysFromToday(60));
          await call("end_tenancy", id);
        }),
      ).rejects.toThrow(/You can mark it as ended from that day/);
      await expect(
        t.asUser(ALICE, async () => {
          const id = await createTenancy({ p_room_id: await newRoom(), p_start_date: today });
          await call("end_tenancy", id);
        }),
      ).rejects.toThrow(/Record the notice/);
    });

    it("checks the notice dates", async () => {
      const attempt = (noticeDate: string, endDate: string) =>
        t.asUser(ALICE, async () => {
          const id = await createTenancy({ p_room_id: await newRoom(), p_start_date: today });
          await notice(id, noticeDate, endDate);
        });
      await expect(attempt(daysFromToday(-1), daysFromToday(60))).rejects.toThrow(
        /before the tenancy started/,
      );
      await expect(attempt(daysFromToday(10), daysFromToday(5))).rejects.toThrow(
        /on or before the end date/,
      );
    });

    it("moves the next tenant in only once the room is free and the day has come", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        const current = await createTenancy({ p_room_id: room, p_start_date: daysFromToday(-30) });
        await notice(current, daysFromToday(-30), today);
        const next = await createTenancy({ p_room_id: room, p_start_date: daysFromToday(1) });

        await db.query("savepoint s");
        await expect(call("start_tenancy", next)).rejects.toThrow(/starts on/);
        await db.query("rollback to savepoint s");

        // Bring the start forward to today: the old tenancy still has to end first.
        await db.query("update public.tenancies set start_date = $2 where id = $1", [next, today]);
        await expect(call("start_tenancy", next)).rejects.toThrow(/hasn't ended yet/);
        await db.query("rollback to savepoint s");

        await db.query("update public.tenancies set start_date = $2 where id = $1", [next, today]);
        await call("end_tenancy", current);
        await call("start_tenancy", next);
        expect((await tenancy(next)).status).toBe("active");
        expect(await roomStatus(room)).toBe("let");
      });
    });

    it("cancels only upcoming tenancies, and keeps them", async () => {
      await t.asUser(ALICE, async () => {
        const room = await newRoom();
        const next = await createTenancy({ p_room_id: room, p_start_date: daysFromToday(10) });
        await call("cancel_tenancy", next);
        expect((await tenancy(next)).status).toBe("cancelled");
        // The slot is free for another upcoming tenant.
        await createTenancy({ p_room_id: room, p_start_date: daysFromToday(20) });
      });
      await expect(
        t.asUser(ALICE, async () => {
          const id = await createTenancy({ p_room_id: await newRoom(), p_start_date: today });
          await call("cancel_tenancy", id);
        }),
      ).rejects.toThrow(/Only an upcoming tenancy can be cancelled/);
    });

    it.each([
      ["active", "prospective"],
      ["active", "ended"],
      ["ending", "active"],
      ["ended", "active"],
      ["cancelled", "prospective"],
    ])("never goes from %s back to %s", async (from, to) => {
      await expect(
        t.asUser(ALICE, async () => {
          const room = await newRoom();
          await insertTenancy(room, from);
          await db.query(
            "update public.tenancies set status = $2, end_date = null, end_reason = null where room_id = $1",
            [room, to],
          );
        }),
      ).rejects.toThrow(/A tenancy can't go from/);
    });

    it("never deletes a tenancy", async () => {
      await expect(
        t.asUser(ALICE, () =>
          db.query("delete from public.tenancies where id = $1", [aliceIds.tenancies]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("access", () => {
    it("doesn't let another organisation let, end or see Alice's rooms", async () => {
      await expect(
        t.asUser(BOB, () => createTenancy({ p_room_id: aliceIds.rooms, p_start_date: today })),
      ).rejects.toThrow(/Room not found/);
      await expect(t.asUser(BOB, () => call("cancel_tenancy", aliceIds.tenancies))).rejects.toThrow(
        /Tenancy not found/,
      );
      await expect(t.asUser(BOB, () => notice(aliceIds.tenancies, today, today))).rejects.toThrow(
        /Tenancy not found/,
      );
    });

    it("is closed to signed-out visitors", async () => {
      for (const fn of ["end_tenancy", "start_tenancy", "cancel_tenancy"]) {
        await expect(t.asAnon(() => call(fn, aliceIds.tenancies))).rejects.toThrow(
          /permission denied/,
        );
      }
    });
  });
});

describe("onboarding", () => {
  const today = todayInLondon();
  const daysFromToday = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const hash = (token: string) => createHash("sha256").update(token).digest("hex");

  type Setup = {
    room: string;
    tenancy: string;
    tenant: string;
    onboarding: string;
    token: string;
    folder: string;
  };

  /** A room with an upcoming tenancy, onboarding started and a live applicant link (committed). */
  async function setUp(startInDays = 20): Promise<Setup> {
    const token = randomBytes(32).toString("base64url");
    return t.asUser(
      ALICE,
      async () => {
        const room = (
          await db.query<{ id: string }>(
            "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Onboarding room') returning id",
            [aliceOrg, aliceIds.properties],
          )
        ).rows[0]!.id;
        const tenancy = (
          await db.query<{ id: string }>(
            "select public.create_tenancy($1, 'Ava', 'Applicant', 'ava@example.test', null, $2, 55000, 'monthly', 1, 0) as id",
            [room, daysFromToday(startInDays)],
          )
        ).rows[0]!.id;
        const tenant = (
          await db.query<{ tenant_id: string }>(
            "select tenant_id from public.tenancy_tenants where tenancy_id = $1",
            [tenancy],
          )
        ).rows[0]!.tenant_id;
        const onboarding = (
          await db.query<{ id: string }>("select public.start_onboarding($1) as id", [tenancy])
        ).rows[0]!.id;
        await db.query("select public.set_portal_link($1, $2)", [onboarding, hash(token)]);
        const { rows } = await db.query<{ folder: string }>(
          "select org_id::text || '/applicants/' || upload_key::text || '/' as folder from public.onboardings where id = $1",
          [onboarding],
        );
        return { room, tenancy, tenant, onboarding, token, folder: rows[0]!.folder };
      },
      true,
    );
  }

  async function steps(onboarding: string) {
    const { rows } = await db.query<{
      id: string;
      kind: string;
      status: string;
      due_date: string;
      owner_is_applicant: boolean;
      owner_user_id: string | null;
    }>(
      "select id, kind, status, to_char(due_date, 'YYYY-MM-DD') as due_date, owner_is_applicant, owner_user_id from public.onboarding_steps where onboarding_id = $1 order by position",
      [onboarding],
    );
    return rows;
  }

  const setStep = (step: string, status: string) =>
    db.query("select public.update_onboarding_step($1, $2, null, false, null, null)", [
      step,
      status,
    ]);

  it("gives every organisation a default eight-step workflow", async () => {
    for (const org of [aliceOrg, bobOrg]) {
      const { rows } = await db.query<{ kind: string }>(
        `select s.kind from public.onboarding_template_steps s
         join public.onboarding_templates tpl on tpl.id = s.template_id
         where tpl.org_id = $1 and tpl.is_default order by s.position`,
        [org],
      );
      expect(rows.map((row) => row.kind)).toEqual([
        "application_form",
        "right_to_rent",
        "referencing",
        "holding_deposit",
        "agreement",
        "deposit",
        "first_rent",
        "move_in",
      ]);
    }
  });

  it("copies the steps into a new onboarding, with due dates counted back from move-in", async () => {
    const { onboarding } = await setUp(20);
    const rows = await t.asUser(ALICE, () => steps(onboarding));
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.due_date)).toEqual(
      [-14, -10, -7, -7, -5, -3, -1, 0].map((offset) => daysFromToday(20 + offset)),
    );
    expect(rows[0]).toMatchObject({ owner_is_applicant: true, owner_user_id: null });
    expect(rows[1]).toMatchObject({ owner_is_applicant: false, owner_user_id: ALICE });
  });

  it("never sets a due date in the past", async () => {
    const { onboarding } = await setUp(3);
    const rows = await t.asUser(ALICE, () => steps(onboarding));
    expect(rows.every((row) => row.due_date >= today)).toBe(true);
  });

  it("starts only for upcoming tenancies, once at a time", async () => {
    const { tenancy } = await setUp();
    await expect(
      t.asUser(ALICE, () => db.query("select public.start_onboarding($1)", [tenancy])),
    ).rejects.toThrow(/already has an onboarding in progress/);
    await expect(
      t.asUser(ALICE, () => db.query("select public.start_onboarding($1)", [aliceIds.tenancies])),
    ).rejects.toThrow(/for upcoming tenancies/);
    await expect(
      t.asUser(BOB, () => db.query("select public.start_onboarding($1)", [tenancy])),
    ).rejects.toThrow(/Tenancy not found/);
  });

  it("moves in only after the other steps, starting the tenancy and completing the onboarding", async () => {
    const { onboarding, tenancy, room } = await setUp(10);
    await t.asUser(ALICE, async () => {
      const all = await steps(onboarding);
      const moveIn = all.find((step) => step.kind === "move_in")!;
      await db.query("savepoint s");
      await expect(setStep(moveIn.id, "done")).rejects.toThrow(/Finish or skip the other steps/);
      await db.query("rollback to savepoint s");

      for (const step of all.filter((step) => step.kind !== "move_in")) {
        await setStep(step.id, step.kind === "referencing" ? "skipped" : "done");
      }
      // The move-in date slips to today, so the tenant can move in.
      await db.query("select public.change_move_in_date($1, $2)", [tenancy, today]);
      await setStep(moveIn.id, "done");

      const result = await db.query(
        `select o.status as onboarding, t.status as tenancy, r.status as room
         from public.onboardings o join public.tenancies t on t.id = o.tenancy_id
         join public.rooms r on r.id = o.room_id where o.id = $1`,
        [onboarding],
      );
      expect(result.rows).toEqual([{ onboarding: "completed", tenancy: "active", room: "let" }]);
      expect(room).toBeDefined();

      const done = await db.query(
        "select count(*)::int as n from public.onboarding_steps where onboarding_id = $1 and completed_by = $2",
        [onboarding, ALICE],
      );
      expect(done.rows).toEqual([{ n: 7 }]);
    });
  });

  it("withdraws the onboarding and switches its link off when the tenancy is cancelled", async () => {
    const { tenancy, onboarding, token } = await setUp();
    await t.asUser(ALICE, () => db.query("select public.cancel_tenancy($1)", [tenancy]), true);
    const { rows } = await t.asUser(ALICE, () =>
      db.query("select status from public.onboardings where id = $1", [onboarding]),
    );
    expect(rows).toEqual([{ status: "withdrawn" }]);
    await expect(
      t.asAnon(() => db.query("select public.portal_overview($1)", [token])),
    ).rejects.toThrow(/isn't valid any more/);
  });

  it("finishes Move in even if the tenant was moved in from the room page", async () => {
    const { onboarding, tenancy } = await setUp(10);
    await t.asUser(ALICE, async () => {
      const all = await steps(onboarding);
      for (const step of all.filter((step) => step.kind !== "move_in")) {
        await setStep(step.id, "done");
      }
      await db.query("select public.change_move_in_date($1, $2)", [tenancy, today]);
      await db.query("select public.start_tenancy($1)", [tenancy]);
      await setStep(all.find((step) => step.kind === "move_in")!.id, "done");
      const { rows } = await db.query("select status from public.onboardings where id = $1", [
        onboarding,
      ]);
      expect(rows).toEqual([{ status: "completed" }]);
    });
  });

  it("only gives steps to people in the organisation", async () => {
    const { onboarding } = await setUp();
    await expect(
      t.asUser(ALICE, async () => {
        const [first] = await steps(onboarding);
        await db.query(
          "select public.update_onboarding_step($1, 'in_progress', $2, false, null, null)",
          [first!.id, BOB],
        );
      }),
    ).rejects.toThrow(/Choose someone in your organisation/);
  });

  it("lists the organisation's active people for choosing an owner", async () => {
    const mine = await t.asUser(CAROL, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.org_people($1)", [
        aliceOrg,
      ]);
      return rows.map((row) => row.id).sort();
    });
    expect(mine).toEqual([ALICE, CAROL].sort());
    const theirs = await t.asUser(BOB, async () => {
      const { rows } = await db.query("select id from public.org_people($1)", [aliceOrg]);
      return rows;
    });
    expect(theirs).toEqual([]);
  });

  describe("applicant portal", () => {
    const overview = (token: string) =>
      t.asAnon(async () => {
        const { rows } = await db.query<{ overview: Record<string, unknown> }>(
          "select public.portal_overview($1) as overview",
          [token],
        );
        return rows[0]!.overview;
      });

    it("shows the applicant their onboarding with the right link, and nothing with a wrong one", async () => {
      const { token, folder } = await setUp();
      const view = await overview(token);
      expect(view).toMatchObject({
        firstName: "Ava",
        room: "Onboarding room",
        uploadFolder: folder,
        application: {},
        submittedAt: null,
      });
      expect((view.steps as unknown[]).length).toBe(8);
      expect((view.steps as { title: string; yours: boolean }[])[0]).toEqual({
        title: "Fill in your application",
        status: "not_started",
        yours: true,
      });
      await expect(overview(randomBytes(32).toString("base64url"))).rejects.toThrow(
        /isn't valid any more/,
      );
      await expect(overview("short")).rejects.toThrow(/isn't valid any more/);
    });

    it("stops working when the link is revoked, replaced or expired", async () => {
      const revoked = await setUp();
      await t.asUser(
        ALICE,
        () => db.query("select public.revoke_portal_link($1)", [revoked.onboarding]),
        true,
      );
      await expect(overview(revoked.token)).rejects.toThrow(/isn't valid any more/);

      const replaced = await setUp();
      await t.asUser(
        ALICE,
        () =>
          db.query("select public.set_portal_link($1, $2)", [
            replaced.onboarding,
            hash("a-brand-new-token-value-here"),
          ]),
        true,
      );
      await expect(overview(replaced.token)).rejects.toThrow(/isn't valid any more/);
      await expect(overview("a-brand-new-token-value-here")).resolves.toMatchObject({
        firstName: "Ava",
      });

      const expired = await setUp();
      await db.query(
        "update public.onboardings set portal_expires_at = now() - interval '1 minute' where id = $1",
        [expired.onboarding],
      );
      await expect(overview(expired.token)).rejects.toThrow(/isn't valid any more/);
    });

    it("saves a draft, then the submitted application, which can't change afterwards", async () => {
      const { token, onboarding } = await setUp();
      const save = (application: object, submit: boolean) =>
        t.asAnon(() =>
          db.query("select public.portal_save_application($1, $2, $3)", [
            token,
            application,
            submit,
          ]),
        );
      // asAnon rolls back, so commit through a definer-style direct call instead.
      await t.db.query("begin");
      await t.db.query("set local role anon");
      await t.db.query("select public.portal_save_application($1, $2, false)", [
        token,
        { legalName: "Ava A" },
      ]);
      await t.db.query("commit");
      let view = await overview(token);
      expect(view.application).toEqual({ legalName: "Ava A" });
      expect((view.steps as { status: string }[])[0]!.status).toBe("in_progress");

      await t.db.query("begin");
      await t.db.query("set local role anon");
      await t.db.query("select public.portal_save_application($1, $2, true)", [
        token,
        { legalName: "Ava Applicant" },
      ]);
      await t.db.query("commit");
      view = await overview(token);
      expect(view.submittedAt).not.toBeNull();
      expect((view.steps as { status: string }[])[0]!.status).toBe("done");
      await expect(save({ legalName: "Changed" }, true)).rejects.toThrow(
        /already sent your application/,
      );

      const staffView = await t.asUser(ALICE, async () => {
        const { rows } = await db.query(
          "select application from public.onboardings where id = $1",
          [onboarding],
        );
        return rows;
      });
      expect(staffView).toEqual([{ application: { legalName: "Ava Applicant" } }]);
    });

    it("lets the applicant upload only into their own folder, and never read files", async () => {
      const mine = await setUp();
      const other = await setUp();
      const upload = (path: string) =>
        t.asAnon(() =>
          db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
            path,
          ]),
        );
      await expect(upload(`${mine.folder}passport.pdf`)).resolves.toBeDefined();
      await expect(upload(`${mine.folder}nested/passport.pdf`)).rejects.toThrow(
        /row-level security/,
      );
      await expect(upload(`${aliceOrg}/properties/x/passport.pdf`)).rejects.toThrow(
        /row-level security/,
      );
      await expect(upload(`${aliceOrg}/applicants/${randomUUID()}/passport.pdf`)).rejects.toThrow(
        /row-level security/,
      );

      await t.asUser(
        ALICE,
        () => db.query("select public.withdraw_onboarding($1)", [other.onboarding]),
        true,
      );
      await expect(upload(`${other.folder}passport.pdf`)).rejects.toThrow(/row-level security/);

      const seen = await t.asAnon(
        async () => (await db.query("select name from storage.objects")).rows,
      );
      expect(seen).toEqual([]);
    });

    it("records an uploaded document against the tenant, and refuses files outside the folder", async () => {
      const { token, folder, tenant, onboarding } = await setUp();
      const path = `${folder}${randomUUID()}-passport.pdf`;
      await db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
        path,
      ]);
      const record = (filePath: string, type = "identity") =>
        t.db
          .query("begin")
          .then(() => t.db.query("set local role anon"))
          .then(() =>
            t.db.query("select public.portal_record_document($1, $2, 'passport.pdf', $3)", [
              token,
              filePath,
              type,
            ]),
          )
          .then(
            () => t.db.query("commit"),
            async (error) => {
              await t.db.query("rollback");
              throw error;
            },
          );

      await expect(record(`${folder}missing.pdf`)).rejects.toThrow(/couldn't find that file/);
      await expect(record(`${aliceOrg}/properties/x/passport.pdf`)).rejects.toThrow(
        /isn't in your folder/,
      );
      await expect(record(path, "gas_safety")).rejects.toThrow(/can't be uploaded here/);
      await record(path);

      const view = await overview(token);
      expect(view.documents).toEqual([
        expect.objectContaining({ fileName: "passport.pdf", type: "identity" }),
      ]);
      const staff = await t.asUser(ALICE, async () => {
        const docs = await db.query(
          "select tenant_id, uploaded_by from public.documents where file_path = $1",
          [path],
        );
        const check = await db.query(
          "select status from public.onboarding_steps where onboarding_id = $1 and kind = 'right_to_rent'",
          [onboarding],
        );
        return { docs: docs.rows, check: check.rows };
      });
      expect(staff).toEqual({
        docs: [{ tenant_id: tenant, uploaded_by: null }],
        check: [{ status: "in_progress" }],
      });
    });

    it("gives signed-out visitors nothing else", async () => {
      const { tenancy } = await setUp();
      for (const statement of [
        "select * from public.onboardings",
        "select * from public.onboarding_steps",
        "select * from public.reminders",
      ]) {
        await expect(t.asAnon(() => db.query(statement))).rejects.toThrow(/permission denied/);
      }
      await expect(
        t.asAnon(() => db.query("select public.start_onboarding($1)", [tenancy])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        t.asAnon(() => db.query("select private.is_org_member($1)", [aliceOrg])),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("right to rent", () => {
    const record = (
      tenant: string,
      onboarding: string | null,
      permission: string,
      expiry: string | null,
      checkDate = today,
    ) =>
      db.query(
        "select public.record_right_to_rent($1, $2, $3, 'online_share_code', $4, $5, null) as id",
        [tenant, onboarding, checkDate, permission, expiry],
      );

    it("creates a reminder four weeks before time-limited permission ends, and completes the step", async () => {
      const { tenant, onboarding } = await setUp();
      const expiry = daysFromToday(200);
      await t.asUser(ALICE, async () => {
        await record(tenant, onboarding, "time_limited", expiry);
        const reminders = await db.query<{ due_date: string; title: string }>(
          "select to_char(due_date, 'YYYY-MM-DD') as due_date, title from public.reminders where tenant_id = $1",
          [tenant],
        );
        expect(reminders.rows).toEqual([
          {
            due_date: daysFromToday(172),
            title: `Right to rent follow-up check for Ava Applicant (permission ends ${expiry.split("-").reverse().join("/")})`,
          },
        ]);
        const step = await db.query(
          "select status, completed_by from public.onboarding_steps where onboarding_id = $1 and kind = 'right_to_rent'",
          [onboarding],
        );
        expect(step.rows).toEqual([{ status: "done", completed_by: ALICE }]);
      });
    });

    it("needs an expiry date only for time-limited permission, and no reminder otherwise", async () => {
      const { tenant } = await setUp();
      await expect(
        t.asUser(ALICE, () => record(tenant, null, "time_limited", null)),
      ).rejects.toThrow(/right_to_rent_checks_expiry_for_time_limited/);
      await t.asUser(ALICE, async () => {
        await record(tenant, null, "unlimited", daysFromToday(100));
        const { rows } = await db.query(
          "select expiry_date from public.right_to_rent_checks where tenant_id = $1",
          [tenant],
        );
        expect(rows).toEqual([{ expiry_date: null }]);
        const reminders = await db.query("select id from public.reminders where tenant_id = $1", [
          tenant,
        ]);
        expect(reminders.rows).toEqual([]);
      });
      await expect(
        t.asUser(ALICE, () => record(tenant, null, "unlimited", null, daysFromToday(1))),
      ).rejects.toThrow(/can't be in the future/);
    });
  });

  it("changes an upcoming move-in date, but not to the past", async () => {
    const { tenancy } = await setUp();
    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.change_move_in_date($1, $2)", [tenancy, daysFromToday(-1)]),
      ),
    ).rejects.toThrow(/today or a later date/);
    await t.asUser(ALICE, async () => {
      await db.query("select public.change_move_in_date($1, $2)", [tenancy, daysFromToday(40)]);
      const { rows } = await db.query<{ start_date: string }>(
        "select to_char(start_date, 'YYYY-MM-DD') as start_date from public.tenancies where id = $1",
        [tenancy],
      );
      expect(rows).toEqual([{ start_date: daysFromToday(40) }]);
    });
  });

  it("withdraws an onboarding and switches its link off", async () => {
    const { onboarding, token } = await setUp();
    await t.asUser(
      ALICE,
      () => db.query("select public.withdraw_onboarding($1)", [onboarding]),
      true,
    );
    await expect(
      t.asAnon(() => db.query("select public.portal_overview($1)", [token])),
    ).rejects.toThrow(/isn't valid any more/);
    await expect(
      t.asUser(ALICE, () => db.query("select public.withdraw_onboarding($1)", [onboarding])),
    ).rejects.toThrow(/Only an onboarding in progress/);
  });
});

describe("tenancy documents and e-signing", () => {
  const RELAY_SECRET = "test-relay-secret-value";
  const relayHash = createHash("sha256").update(RELAY_SECRET).digest("hex");

  beforeAll(async () => {
    await db.query(
      "insert into private.esign_settings (relay_secret_hash) values ($1) on conflict (id) do update set relay_secret_hash = excluded.relay_secret_hash",
      [relayHash],
    );
  });

  type Setup = {
    tenancy: string;
    guarantor: string;
    tenancyRequest: string;
    guarantorRequest: string;
    ids: { tenancy: string; guarantor: string };
  };

  /** An upcoming tenancy with a guarantor and both agreements sent (committed). */
  async function setUp(): Promise<Setup> {
    return t.asUser(
      ALICE,
      async () => {
        const room = (
          await db.query<{ id: string }>(
            "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Signing room') returning id",
            [aliceOrg, aliceIds.properties],
          )
        ).rows[0]!.id;
        const tenancy = (
          await db.query<{ id: string }>(
            "select public.create_tenancy($1, 'Tess', 'Tenant', 'tess@example.test', null, current_date + 30, 55000, 'monthly', 1, 0) as id",
            [room],
          )
        ).rows[0]!.id;
        const guarantor = (
          await db.query<{ id: string }>(
            "select public.add_guarantor($1, 'Gwen Guarantor', 'GWEN@example.test', null, '1 Safe Street') as id",
            [tenancy],
          )
        ).rows[0]!.id;
        const send = async (
          kind: string,
          providerId: string,
          signers: object[],
          guarantorId: string | null,
        ) =>
          (
            await db.query<{ id: string }>(
              "select public.record_signature_request($1, $2, null, $3, 'fake', $4, null, $5) as id",
              [tenancy, kind, guarantorId, providerId, JSON.stringify(signers)],
            )
          ).rows[0]!.id;
        const tenancyProvider = `tenancy-${randomUUID()}`;
        const guarantorProvider = `guarantor-${randomUUID()}`;
        const tenancyRequest = await send(
          "tenancy_agreement",
          tenancyProvider,
          [
            { role: "tenant", name: "Tess Tenant", email: "tess@example.test", order: 1 },
            { role: "organisation", name: "Alice Adams", email: "alice@example.test", order: 2 },
          ],
          null,
        );
        const guarantorRequest = await send(
          "guarantor_agreement",
          guarantorProvider,
          [
            { role: "guarantor", name: "Gwen Guarantor", email: "gwen@example.test", order: 1 },
            { role: "organisation", name: "Alice Adams", email: "alice@example.test", order: 2 },
          ],
          guarantor,
        );
        return {
          tenancy,
          guarantor,
          tenancyRequest,
          guarantorRequest,
          ids: { tenancy: tenancyProvider, guarantor: guarantorProvider },
        };
      },
      true,
    );
  }

  /** Calls the webhook function as a signed-out visitor would, committing. */
  async function applyEvent(
    providerId: string,
    status: string,
    signers: object[],
    secret = RELAY_SECRET,
    key = randomUUID(),
  ) {
    await db.query("begin");
    await db.query("set local role anon");
    try {
      const { rows } = await db.query<{ result: string }>(
        "select public.esign_apply_event($1, 'fake', $2, $3, 'signature_request_signed', now(), $4, $5) as result",
        [secret, providerId, key, status, JSON.stringify(signers)],
      );
      await db.query("commit");
      return rows[0]!.result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }

  const statusOf = (requestId: string) =>
    t.asUser(ALICE, async () => {
      const request = await db.query<{ status: string }>(
        "select status from public.signature_requests where id = $1",
        [requestId],
      );
      const signers = await db.query<{ role: string; status: string }>(
        "select role, status from public.signature_request_signers where request_id = $1 order by signing_order",
        [requestId],
      );
      return { status: request.rows[0]!.status, signers: signers.rows };
    });

  it("gives every organisation DRAFT tenancy and guarantor agreement templates", async () => {
    const { rows } = await db.query<{ kind: string; is_draft: boolean; drafted: boolean }>(
      "select kind, is_draft, body like '%DRAFT: replace with solicitor-approved wording%' as drafted from public.document_templates where org_id = $1 and is_default order by kind",
      [aliceOrg],
    );
    expect(rows).toEqual([
      { kind: "tenancy_agreement", is_draft: true, drafted: true },
      { kind: "guarantor_agreement", is_draft: true, drafted: true },
    ]);
  });

  it("lets only admins edit templates", async () => {
    const edit = (user: string) =>
      t.asUser(user, async () => {
        const result = await db.query(
          "update public.document_templates set name = 'Edited' where org_id = $1 and kind = 'tenancy_agreement'",
          [aliceOrg],
        );
        return result.affectedRows;
      });
    expect(await edit(CAROL)).toBe(0);
    expect(await edit(ALICE)).toBe(1);
    expect(await edit(BOB)).toBe(0);
    const staffCanRead = await t.asUser(CAROL, async () => {
      const { rows } = await db.query(
        "select id from public.document_templates where org_id = $1",
        [aliceOrg],
      );
      return rows.length;
    });
    expect(staffCanRead).toBeGreaterThanOrEqual(2);
  });

  it("allows one guarantor per tenancy", async () => {
    const { tenancy } = await setUp();
    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.add_guarantor($1, 'Another', 'another@example.test', null, null)", [
          tenancy,
        ]),
      ),
    ).rejects.toThrow(/already has a guarantor/);
  });

  it("only accepts webhook events with the relay secret, once each", async () => {
    const { ids } = await setUp();
    await expect(applyEvent(ids.tenancy, "partly_signed", [], "wrong-secret")).rejects.toThrow(
      /Not allowed/,
    );
    const key = randomUUID();
    expect(await applyEvent(ids.tenancy, "partly_signed", [], RELAY_SECRET, key)).toBe("applied");
    expect(await applyEvent(ids.tenancy, "partly_signed", [], RELAY_SECRET, key)).toBe("duplicate");
    expect(await applyEvent("nobody-knows-this", "completed", [])).toBe("unknown");
  });

  it("keeps the tenant's signature when the guarantor requirement is removed, and logs why", async () => {
    const setup = await setUp();
    await applyEvent(setup.ids.tenancy, "partly_signed", [
      { email: "TESS@example.test", status: "signed" },
    ]);

    await t.asUser(
      ALICE,
      () =>
        db.query("select public.remove_guarantor($1, 'Tenant paid six months upfront')", [
          setup.guarantor,
        ]),
      true,
    );

    expect(await statusOf(setup.tenancyRequest)).toEqual({
      status: "partly_signed",
      signers: [
        { role: "tenant", status: "signed" },
        { role: "organisation", status: "awaiting" },
      ],
    });
    expect((await statusOf(setup.guarantorRequest)).status).toBe("cancelled");

    const logged = await t.asUser(ALICE, async () => {
      const guarantor = await db.query(
        "select status, removed_by, removed_reason from public.tenancy_guarantors where id = $1",
        [setup.guarantor],
      );
      const audit = await db.query<{ n: number }>(
        "select count(*)::int as n from public.audit_log where record_id = $1 and action = 'update' and actor_user_id = $2",
        [setup.guarantor, ALICE],
      );
      return { guarantor: guarantor.rows, audit: audit.rows[0]!.n };
    });
    expect(logged).toEqual({
      guarantor: [
        { status: "removed", removed_by: ALICE, removed_reason: "Tenant paid six months upfront" },
      ],
      audit: 1,
    });

    // Countersigning still completes the tenancy agreement afterwards.
    await applyEvent(setup.ids.tenancy, "completed", [
      { email: "alice@example.test", status: "signed" },
    ]);
    expect((await statusOf(setup.tenancyRequest)).status).toBe("completed");
  });

  it("won't remove a guarantor who has signed, or without a reason", async () => {
    const setup = await setUp();
    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.remove_guarantor($1, '  ')", [setup.guarantor]),
      ),
    ).rejects.toThrow(/Give a reason/);
    await applyEvent(setup.ids.guarantor, "partly_signed", [
      { email: "gwen@example.test", status: "signed" },
    ]);
    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.remove_guarantor($1, 'Changed mind')", [setup.guarantor]),
      ),
    ).rejects.toThrow(/already signed/);
  });

  it("leaves finished requests alone and ticks the onboarding's agreement step on completion", async () => {
    const setup = await setUp();
    const onboarding = await t.asUser(
      ALICE,
      async () =>
        (
          await db.query<{ id: string }>("select public.start_onboarding($1) as id", [
            setup.tenancy,
          ])
        ).rows[0]!.id,
      true,
    );
    await applyEvent(setup.ids.tenancy, "completed", [
      { email: "tess@example.test", status: "signed" },
      { email: "alice@example.test", status: "signed" },
    ]);
    expect(await applyEvent(setup.ids.tenancy, "declined", [])).toBe("ignored");
    expect((await statusOf(setup.tenancyRequest)).status).toBe("completed");

    const step = await t.asUser(ALICE, async () => {
      const { rows } = await db.query(
        "select status from public.onboarding_steps where onboarding_id = $1 and kind = 'agreement'",
        [onboarding],
      );
      return rows;
    });
    expect(step).toEqual([{ status: "done" }]);
  });

  it("allows one open request per agreement type, and keeps e-signing away from other organisations", async () => {
    const setup = await setUp();
    await expect(
      t.asUser(ALICE, () =>
        db.query(
          `select public.record_signature_request($1, 'tenancy_agreement', null, null, 'fake', 'again', null, '[{"role":"tenant","name":"T","email":"t@example.test","order":1}]')`,
          [setup.tenancy],
        ),
      ),
    ).rejects.toThrow(/signature_requests_one_open_per_kind/);
    await expect(
      t.asUser(BOB, () =>
        db.query("select public.remove_guarantor($1, 'Not mine')", [setup.guarantor]),
      ),
    ).rejects.toThrow(/Guarantor not found/);
    await expect(
      t.asAnon(() => db.query("select * from public.signature_requests")),
    ).rejects.toThrow(/permission denied/);
    await expect(t.asAnon(() => db.query("select * from private.esign_settings"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("tenant portal", () => {
  // Tina and Tom rent rooms from Alice's org; Beth rents from Bob's.
  const TINA = "aaaaaaaa-0000-4000-8000-00000000000a";
  const TOM = "aaaaaaaa-0000-4000-8000-00000000000b";
  const BETH = "aaaaaaaa-0000-4000-8000-00000000000c";
  const hash = (token: string) => createHash("sha256").update(token).digest("hex");
  type Home = { tenancy: string; tenant: string; property: string; room: string };
  let tina: Home;
  let tom: Home;
  let beth: Home;
  let servedDoc: string;
  let unservedDoc: string;

  /** Rows a user can see, as ids. */
  const visible = (user: string, sql: string, params: unknown[] = []) =>
    t.asUser(user, async () =>
      (await db.query<{ id: string }>(sql, params)).rows.map((row) => row.id),
    );

  /** Lets a room from today as staff, invites the tenant, and the tenant joins. */
  async function letAndJoin(
    staff: string,
    orgId: string,
    propertyId: string,
    user: string,
    first: string,
  ): Promise<Home> {
    const token = randomBytes(32).toString("base64url");
    const home = await t.asUser(
      staff,
      async () => {
        const room = (
          await db.query<{ id: string }>(
            "insert into public.rooms (org_id, property_id, name) values ($1, $2, $3) returning id",
            [orgId, propertyId, `${first}'s room`],
          )
        ).rows[0]!.id;
        const tenancy = (
          await db.query<{ id: string }>(
            "select public.create_tenancy($1, $2, 'Tenant', null, null, current_date - 40, 60000, 'monthly', 1, 0) as id",
            [room, first],
          )
        ).rows[0]!.id;
        const tenant = (
          await db.query<{ tenant_id: string }>(
            "select tenant_id from public.tenancy_tenants where tenancy_id = $1",
            [tenancy],
          )
        ).rows[0]!.tenant_id;
        await db.query("select public.create_tenant_invite($1, $2)", [tenant, hash(token)]);
        return { tenancy, tenant, property: propertyId, room };
      },
      true,
    );
    await t.createAuthUser(user, `${first.toLowerCase()}@example.test`, `${first} Tenant`);
    await t.asUser(user, () => db.query("select public.claim_tenant_invite($1)", [token]), true);
    return home;
  }

  beforeAll(async () => {
    tina = await letAndJoin(ALICE, aliceOrg, aliceIds.properties, TINA, "Tina");
    tom = await letAndJoin(ALICE, aliceOrg, aliceIds.properties, TOM, "Tom");
    beth = await letAndJoin(BOB, bobOrg, bobIds.properties, BETH, "Beth");

    await t.asUser(
      ALICE,
      async () => {
        for (const home of [tina, tom]) {
          await db.query("select public.sync_rent_charges($1)", [home.tenancy]);
          await db.query(
            "insert into public.rent_payments (org_id, tenancy_id, paid_on, amount_pence, method) values ($1, $2, current_date, 60000, 'bank_transfer')",
            [aliceOrg, home.tenancy],
          );
          await db.query(
            "insert into public.messages (org_id, tenancy_id, sender, body) values ($1, $2, 'staff', 'Welcome!')",
            [aliceOrg, home.tenancy],
          );
        }
        const doc = (path: string) =>
          db.query<{ id: string }>(
            "insert into public.documents (org_id, document_type, file_path, file_name, property_id) values ($1, 'gas_safety', $2, 'gas.pdf', $3) returning id",
            [aliceOrg, path, aliceIds.properties],
          );
        servedDoc = (await doc(`${aliceOrg}/properties/x/served-gas.pdf`)).rows[0]!.id;
        unservedDoc = (await doc(`${aliceOrg}/properties/x/private-gas.pdf`)).rows[0]!.id;
        await db.query(
          "insert into public.document_services (org_id, document_id, tenancy_id) values ($1, $2, $3)",
          [aliceOrg, servedDoc, tina.tenancy],
        );
      },
      true,
    );
    for (const name of ["served-gas.pdf", "private-gas.pdf"]) {
      await db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
        `${aliceOrg}/properties/x/${name}`,
      ]);
    }
  }, 60_000);

  describe("joining", () => {
    it("shows who an invite is for, accepts it once, and refuses staff accounts", async () => {
      const token = randomBytes(32).toString("base64url");
      const tenant = await t.asUser(
        ALICE,
        async () => {
          const room = (
            await db.query<{ id: string }>(
              "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Invite room') returning id",
              [aliceOrg, aliceIds.properties],
            )
          ).rows[0]!.id;
          const tenancy = (
            await db.query<{ id: string }>(
              "select public.create_tenancy($1, 'Ivy', 'Invitee', 'ivy@example.test', null, current_date + 5, 50000, 'monthly', 1, 0) as id",
              [room],
            )
          ).rows[0]!.id;
          const id = (
            await db.query<{ tenant_id: string }>(
              "select tenant_id from public.tenancy_tenants where tenancy_id = $1",
              [tenancy],
            )
          ).rows[0]!.tenant_id;
          await db.query("select public.create_tenant_invite($1, $2)", [id, hash(token)]);
          return id;
        },
        true,
      );

      const info = await t.asAnon(
        async () =>
          (await db.query("select public.tenant_invite_info($1) as info", [token])).rows[0],
      );
      expect(info).toEqual({
        info: {
          organisation: expect.stringMatching(/^Alice Lettings/),
          firstName: "Ivy",
          email: "ivy@example.test",
        },
      });

      await expect(
        t.asUser(CAROL, () => db.query("select public.claim_tenant_invite($1)", [token])),
      ).rejects.toThrow(/staff account/);
      const IVY = "aaaaaaaa-0000-4000-8000-0000000000ff";
      await t.createAuthUser(IVY, "ivy@example.test");
      await t.asUser(IVY, () => db.query("select public.claim_tenant_invite($1)", [token]), true);
      await expect(
        t.asUser(IVY, () => db.query("select public.claim_tenant_invite($1)", [token])),
      ).rejects.toThrow(/isn't valid any more/);
      await expect(
        t.asUser(ALICE, () =>
          db.query("select public.create_tenant_invite($1, $2)", [
            tenant,
            hash("another-token-value-123"),
          ]),
        ),
      ).rejects.toThrow(/already joined/);
    });
  });

  describe("tenants only ever see their own tenancy", () => {
    it("sees only their own tenant record and tenancy", async () => {
      expect(await visible(TINA, "select id from public.tenancies")).toEqual([tina.tenancy]);
      expect(await visible(TINA, "select id from public.tenants")).toEqual([tina.tenant]);
      expect(await visible(BETH, "select id from public.tenancies")).toEqual([beth.tenancy]);
    });

    it("gets only safe details of their own home", async () => {
      const home = await t.asUser(
        TINA,
        async () =>
          (
            await db.query<{ home: Record<string, unknown>[] }>(
              "select public.tenant_home() as home",
            )
          ).rows[0]!.home,
      );
      expect(home).toHaveLength(1);
      expect(home[0]).toMatchObject({
        tenancyId: tina.tenancy,
        rentPence: 60000,
        roomId: tina.room,
      });
      expect(JSON.stringify(home)).not.toMatch(/head_rent|headRent|owner|tags/);
    });

    it.each([
      "properties",
      "rooms",
      "owners",
      "property_owners",
      "tenancy_tenants",
      "organisations",
      "memberships",
      "audit_log",
      "onboardings",
      "onboarding_steps",
      "right_to_rent_checks",
      "reminders",
      "signature_requests",
      "tenancy_guarantors",
      "document_templates",
      "tenant_portal_invites",
    ])("sees nothing in %s", async (table) => {
      expect(await visible(TINA, `select id from public.${table}`)).toEqual([]);
    });

    it("sees only their own charges and payments, and can't change them", async () => {
      const charges = await t.asUser(
        TINA,
        async () =>
          (
            await db.query<{ tenancy_id: string }>(
              "select distinct tenancy_id from public.rent_charges",
            )
          ).rows,
      );
      expect(charges).toEqual([{ tenancy_id: tina.tenancy }]);
      const payments = await t.asUser(
        TINA,
        async () =>
          (
            await db.query<{ tenancy_id: string }>(
              "select distinct tenancy_id from public.rent_payments",
            )
          ).rows,
      );
      expect(payments).toEqual([{ tenancy_id: tina.tenancy }]);

      await expect(
        t.asUser(TINA, () =>
          db.query(
            "insert into public.rent_payments (org_id, tenancy_id, paid_on, amount_pence, method) values ($1, $2, current_date, 999999, 'cash')",
            [aliceOrg, tina.tenancy],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      const changed = await t.asUser(
        TINA,
        async () =>
          (
            await db.query(
              "update public.rent_charges set amount_pence = 1 where tenancy_id = $1",
              [tina.tenancy],
            )
          ).affectedRows,
      );
      expect(changed).toBe(0);
      await expect(
        t.asUser(TINA, () => db.query("select public.sync_rent_charges($1)", [tom.tenancy])),
      ).rejects.toThrow(/Tenancy not found/);
    });

    it("reports repairs only for their own home, always as 'reported' and as themselves", async () => {
      const report = (user: string, home: Home, extra = "") =>
        t.asUser(
          user,
          () =>
            db.query<{ id: string }>(
              `insert into public.maintenance_requests (org_id, property_id, room_id, tenancy_id, reported_by, title, description${extra ? ", status" : ""}) values ($1, $2, $3, $4, $5, 'Boiler', 'No hot water'${extra ? `, '${extra}'` : ""}) returning id`,
              [aliceOrg, home.property, home.room, home.tenancy, user],
            ),
          true,
        );
      const mine = (await report(TINA, tina)).rows[0]!.id;
      await expect(report(TINA, tom)).rejects.toThrow(/row-level security/);
      await expect(report(TINA, tina, "done")).rejects.toThrow(/row-level security/);
      await expect(
        t.asUser(TINA, () =>
          db.query(
            "insert into public.maintenance_requests (org_id, property_id, room_id, tenancy_id, reported_by, title, description) values ($1, $2, $3, $4, $5, 'Spoof', 'x')",
            [aliceOrg, tina.property, tina.room, tina.tenancy, TOM],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        t.asUser(TINA, () =>
          db.query(
            "insert into public.maintenance_requests (org_id, property_id, room_id, tenancy_id, reported_by, title, description) values ($1, $2, $3, $4, $5, 'Wrong room', 'x')",
            [aliceOrg, tina.property, tom.room, tina.tenancy, TINA],
          ),
        ),
      ).rejects.toThrow(/row-level security/);

      const closed = await t.asUser(
        TINA,
        async () =>
          (
            await db.query("update public.maintenance_requests set status = 'done' where id = $1", [
              mine,
            ])
          ).affectedRows,
      );
      expect(closed).toBe(0);
      expect(
        await visible(TOM, "select id from public.maintenance_requests where id = $1", [mine]),
      ).toEqual([]);

      // Photos: only into their own repair's folder, and only they (and staff) can see them.
      const path = `${aliceOrg}/maintenance/${mine}/boiler.jpg`;
      await t.asUser(
        TINA,
        async () => {
          await db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
            path,
          ]);
          await db.query(
            "insert into public.maintenance_photos (org_id, request_id, file_path, file_name, uploaded_by) values ($1, $2, $3, 'boiler.jpg', $4)",
            [aliceOrg, mine, path, TINA],
          );
        },
        true,
      );
      await expect(
        t.asUser(TOM, () =>
          db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
            `${aliceOrg}/maintenance/${mine}/sneaky.jpg`,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
      const seen = (user: string) =>
        t.asUser(
          user,
          async () =>
            (
              await db.query<{ name: string }>("select name from storage.objects where name = $1", [
                path,
              ])
            ).rows.length,
        );
      expect(await seen(TINA)).toBe(1);
      expect(await seen(TOM)).toBe(0);
      expect(await seen(ALICE)).toBe(1);
      expect(await seen(BETH)).toBe(0);
    });

    it("messages only about their own tenancy, always as the tenant, and never edits them", async () => {
      await t.asUser(
        TINA,
        () =>
          db.query(
            "insert into public.messages (org_id, tenancy_id, sender, body) values ($1, $2, 'staff', '  Thanks!  ')",
            [aliceOrg, tina.tenancy],
          ),
        true,
      );
      const thread = await t.asUser(
        TINA,
        async () =>
          (
            await db.query<{
              sender: string;
              body: string;
              author_user_id: string | null;
              tenancy_id: string;
            }>(
              "select sender, body, author_user_id, tenancy_id from public.messages order by created_at",
            )
          ).rows,
      );
      expect(thread.every((message) => message.tenancy_id === tina.tenancy)).toBe(true);
      expect(thread.at(-1)).toEqual({
        sender: "tenant",
        body: "Thanks!",
        author_user_id: TINA,
        tenancy_id: tina.tenancy,
      });
      expect(thread[0]).toMatchObject({ sender: "staff", body: "Welcome!" });

      await expect(
        t.asUser(TINA, () =>
          db.query(
            "insert into public.messages (org_id, tenancy_id, sender, body) values ($1, $2, 'tenant', 'Hi Tom')",
            [aliceOrg, tom.tenancy],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        t.asUser(TINA, () => db.query("update public.messages set body = 'edited'")),
      ).rejects.toThrow(/permission denied/);
      await expect(
        t.asUser(ALICE, () => db.query("update public.messages set body = 'edited'")),
      ).rejects.toThrow(/permission denied/);
    });

    it("sees and opens only documents served to them", async () => {
      expect(await visible(TINA, "select id from public.documents")).toEqual([servedDoc]);
      expect(await visible(TOM, "select id from public.documents")).toEqual([]);
      const files = (user: string) =>
        t.asUser(user, async () =>
          (
            await db.query<{ name: string }>(
              "select name from storage.objects where name like '%gas.pdf'",
            )
          ).rows.map((row) => row.name),
        );
      expect(await files(TINA)).toEqual([`${aliceOrg}/properties/x/served-gas.pdf`]);
      expect(await files(TOM)).toEqual([]);
      expect(unservedDoc).toBeDefined();
    });

    it("gives a tenant of another organisation nothing of this one's", async () => {
      for (const table of [
        "tenancies",
        "rent_charges",
        "messages",
        "maintenance_requests",
        "documents",
      ]) {
        const rows = await t.asUser(
          BETH,
          async () =>
            (await db.query<{ org_id: string }>(`select org_id from public.${table}`)).rows,
        );
        expect(rows.every((row) => row.org_id === bobOrg)).toBe(true);
      }
    });

    it("gives signed-out visitors nothing", async () => {
      for (const table of [
        "rent_charges",
        "rent_payments",
        "messages",
        "maintenance_requests",
        "document_services",
      ]) {
        await expect(t.asAnon(() => db.query(`select * from public.${table}`))).rejects.toThrow(
          /permission denied/,
        );
      }
      await expect(t.asAnon(() => db.query("select public.tenant_home()"))).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe("rent schedule", () => {
    /** An ended tenancy with fixed dates, so the charges don't depend on today. */
    async function schedule(
      start: string,
      end: string,
      frequency: string,
      dueDay: number,
      rent: number,
    ) {
      return t.asUser(ALICE, async () => {
        const room = (
          await db.query<{ id: string }>(
            "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Schedule room') returning id",
            [aliceOrg, aliceIds.properties],
          )
        ).rows[0]!.id;
        const tenancy = (
          await db.query<{ id: string }>(
            "insert into public.tenancies (org_id, room_id, start_date, end_date, end_reason, status, rent_pence, rent_frequency, rent_due_day) values ($1, $2, $3, $4, 'tenant_notice', 'ended', $5, $6, $7) returning id",
            [aliceOrg, room, start, end, rent, frequency, dueDay],
          )
        ).rows[0]!.id;
        const first = (
          await db.query<{ n: number }>("select public.sync_rent_charges($1) as n", [tenancy])
        ).rows[0]!.n;
        const again = (
          await db.query<{ n: number }>("select public.sync_rent_charges($1) as n", [tenancy])
        ).rows[0]!.n;
        const { rows } = await db.query<{ period: string; amount: number }>(
          "select to_char(period_start, 'DD/MM') || '-' || to_char(period_end, 'DD/MM') as period, amount_pence as amount from public.rent_charges where tenancy_id = $1 order by period_start",
          [tenancy],
        );
        return { first, again, rows };
      });
    }
    const perDay = (rent: number, days: number) => Math.floor((rent * 12 * days) / 365);

    it("charges monthly rent on the due day, by the day for part months, once each", async () => {
      const result = await schedule("2026-01-15", "2026-04-10", "monthly", 1, 60000);
      expect(result.rows).toEqual([
        { period: "15/01-31/01", amount: perDay(60000, 17) },
        { period: "01/02-28/02", amount: 60000 },
        { period: "01/03-31/03", amount: 60000 },
        { period: "01/04-10/04", amount: perDay(60000, 10) },
      ]);
      expect(result).toMatchObject({ first: 4, again: 0 });
    });

    it("keeps the due day at the end of shorter months", async () => {
      const result = await schedule("2026-01-31", "2026-03-15", "monthly", 31, 60000);
      expect(result.rows).toEqual([
        { period: "31/01-27/02", amount: 60000 },
        { period: "28/02-15/03", amount: perDay(60000, 16) },
      ]);
    });

    it("charges weekly rent on the due weekday, by the day for part weeks", async () => {
      // Wednesday 07/01/2026 to Wednesday 28/01/2026, due on Mondays.
      const result = await schedule("2026-01-07", "2026-01-28", "weekly", 1, 15000);
      expect(result.rows).toEqual([
        { period: "07/01-11/01", amount: Math.floor((15000 * 5) / 7) },
        { period: "12/01-18/01", amount: 15000 },
        { period: "19/01-25/01", amount: 15000 },
        { period: "26/01-28/01", amount: Math.floor((15000 * 3) / 7) },
      ]);
    });

    it("never charges upcoming tenancies, or a voided period twice", async () => {
      await t.asUser(ALICE, async () => {
        const charge = (
          await db.query<{ id: string }>(
            "select id from public.rent_charges where tenancy_id = $1 and source = 'schedule' order by period_start limit 1",
            [tina.tenancy],
          )
        ).rows[0]!.id;
        await db.query(
          "update public.rent_charges set status = 'voided', void_reason = 'Agreed rent-free week', voided_at = now() where id = $1",
          [charge],
        );
        const added = (
          await db.query<{ n: number }>("select public.sync_rent_charges($1) as n", [tina.tenancy])
        ).rows[0]!.n;
        expect(added).toBe(0);
      });
    });
  });
});

describe("role migration (0002)", () => {
  async function databaseBefore0002(role: string) {
    const legacy = new PGlite();
    await installSupabaseStubs(legacy);
    await applyMigrations(legacy, { before: "0002" });
    await legacy.query("insert into auth.users (id, email) values ($1, 'a@example.test')", [ALICE]);
    const { rows } = await legacy.query<{ id: string }>(
      "insert into public.organisations (name) values ('Old Org') returning id",
    );
    await legacy.query(
      "insert into public.memberships (org_id, user_id, role) values ($1, $2, $3)",
      [rows[0]!.id, ALICE, role],
    );
    return legacy;
  }

  it("turns org_admin into admin and backfills profiles", async () => {
    const legacy = await databaseBefore0002("org_admin");
    await applyMigrations(legacy, { from: "0002" });
    const { rows } = await legacy.query<{ role: string; email: string }>(
      "select m.role, u.email from public.memberships m join public.users u on u.id = m.user_id",
    );
    expect(rows).toEqual([{ role: "admin", email: "a@example.test" }]);
    await legacy.close();
  }, 60_000);

  it("refuses to run while removed roles are still in use", async () => {
    const legacy = await databaseBefore0002("tenant");
    await expect(applyMigrations(legacy, { from: "0002" })).rejects.toThrow(
      /role other than org_admin or staff/,
    );
    await legacy.close();
  }, 60_000);
});
