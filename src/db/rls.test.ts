// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies every migration to an in-memory Postgres (PGlite) with a minimal
 * stand-in for Supabase's auth schema and roles, then checks RLS behaviour.
 */

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;
let aliceOrg: string;
let bobOrg: string;

async function asUser<T>(userId: string | null, fn: () => Promise<T>, commit = false): Promise<T> {
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
  try {
    const result = await fn();
    await db.exec(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  await db.exec("set local role anon");
  try {
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

async function createOrg(userId: string, name: string): Promise<string> {
  const { rows } = await asUser(
    userId,
    () => db.query<{ id: string }>("select public.create_organisation($1) as id", [name]),
    true,
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
  }

  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  aliceOrg = await createOrg(ALICE, "  Alice Lettings ");
  bobOrg = await createOrg(BOB, "Bob Homes");
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
    await asUser(ALICE, async () => {
      const orgs = await db.query<{ id: string; name: string }>(
        "select id, name from public.organisations",
      );
      expect(orgs.rows).toEqual([{ id: aliceOrg, name: "Alice Lettings" }]);

      const memberships = await db.query<{ org_id: string; role: string }>(
        "select org_id, role from public.memberships",
      );
      expect(memberships.rows).toEqual([{ org_id: aliceOrg, role: "org_admin" }]);
    });
  });

  it("blocks direct writes from signed-in users", async () => {
    await expect(
      asUser(ALICE, () => db.query("insert into public.organisations (name) values ('Sneaky')")),
    ).rejects.toThrow(/row-level security/);

    await expect(
      asUser(ALICE, () =>
        db.query(
          "insert into public.memberships (org_id, user_id, role) values ($1, $2, 'org_admin')",
          [bobOrg, ALICE],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    await asUser(ALICE, async () => {
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
    await expect(asAnon(() => db.query("select * from public.organisations"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asAnon(() => db.query("select public.create_organisation('Nope')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("create_organisation", () => {
  it("requires a signed-in user", async () => {
    await expect(
      asUser(null, () => db.query("select public.create_organisation('Nope')")),
    ).rejects.toThrow(/Not signed in/);
  });

  it("rejects names that are too short", async () => {
    await expect(
      asUser(ALICE, () => db.query("select public.create_organisation('A')")),
    ).rejects.toThrow(/between 2 and 120/);
  });
});

describe("audit log", () => {
  it("records who created the organisation and membership", async () => {
    await asUser(ALICE, async () => {
      const { rows } = await db.query<{
        table_name: string;
        action: string;
        actor_user_id: string;
      }>("select table_name, action, actor_user_id from public.audit_log order by table_name");
      expect(rows).toEqual([
        { table_name: "memberships", action: "insert", actor_user_id: ALICE },
        { table_name: "organisations", action: "insert", actor_user_id: ALICE },
      ]);
    });
  });

  it("cannot be written to by users", async () => {
    await expect(
      asUser(ALICE, () =>
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
