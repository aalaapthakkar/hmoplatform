/**
 * Stores the hash of CRON_SECRET (from .env.local) in the database, so the
 * daily compliance reminder job can read what's due. Run once per database,
 * and again whenever the secret changes:
 *
 *   npm run cron:setup
 *
 * The secret itself never leaves .env.local (and Vercel's settings).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { z } from "zod";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const env = z
  .object({
    DATABASE_URL: z.url("Set DATABASE_URL in .env.local first."),
    CRON_SECRET: z
      .string("Set CRON_SECRET (32 or more characters) in .env.local first.")
      .min(32, "Set CRON_SECRET (32 or more characters) in .env.local first."),
  })
  .safeParse(process.env);

async function main() {
  if (!env.success) {
    for (const issue of env.error.issues) console.error(issue.message);
    process.exitCode = 1;
    return;
  }
  const hash = createHash("sha256").update(env.data.CRON_SECRET).digest("hex");
  const sql = postgres(env.data.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`
      insert into private.app_secrets (name, secret_hash) values ('cron', ${hash})
      on conflict (name) do update set secret_hash = excluded.secret_hash, updated_at = now()`;
    console.log("Scheduled jobs are set up: the cron secret is stored (as a hash).");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
