import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * In-memory Postgres (PGlite) with a minimal stand-in for Supabase's roles
 * and auth schema, with every migration applied. For tests only.
 */

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");

export type TestDatabase = {
  db: PGlite;
  /** Runs fn as a signed-in user (or with no user), inside a transaction. Rolls back unless commit is true. */
  asUser<T>(userId: string | null, fn: () => Promise<T>, commit?: boolean): Promise<T>;
  /** Runs fn as a signed-out visitor, then rolls back. */
  asAnon<T>(fn: () => Promise<T>): Promise<T>;
  /** Adds an auth user, which also creates their public.users profile. */
  createAuthUser(id: string, email: string, fullName?: string): Promise<void>;
  /** Creates an organisation through the onboarding RPC, as userId. */
  createOrg(userId: string, name: string): Promise<string>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  await installSupabaseStubs(db);
  await applyMigrations(db);

  async function asUser<T>(
    userId: string | null,
    fn: () => Promise<T>,
    commit = false,
  ): Promise<T> {
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

  async function createAuthUser(id: string, email: string, fullName?: string) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      id,
      email,
      fullName ? { full_name: fullName } : {},
    ]);
  }

  async function createOrg(userId: string, name: string) {
    const { rows } = await asUser(
      userId,
      () => db.query<{ id: string }>("select public.create_organisation($1) as id", [name]),
      true,
    );
    return rows[0]!.id;
  }

  return { db, asUser, asAnon, createAuthUser, createOrg };
}

/** Just enough of Supabase's roles and auth schema for the migrations to run. */
export async function installSupabaseStubs(db: PGlite) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);
}

/**
 * Applies migrations in file order. `from` and `before` are file-name
 * prefixes (such as "0002") for applying only part of the history.
 */
export async function applyMigrations(
  db: PGlite,
  { from, before }: { from?: string; before?: string } = {},
) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (before && file >= before) return;
    if (from && file < from) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
  }
}
