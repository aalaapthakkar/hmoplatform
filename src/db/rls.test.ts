// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createTestDatabase,
  installSupabaseStubs,
  type TestDatabase,
} from "./testing/pglite";

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

let t: TestDatabase;
let db: PGlite;
let aliceOrg: string;
let bobOrg: string;

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
        "select table_name, action, actor_user_id from public.audit_log where actor_user_id is not null order by table_name",
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
