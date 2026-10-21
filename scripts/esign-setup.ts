/**
 * Stores the hash of ESIGN_RELAY_SECRET (from .env.local) in the database,
 * so the e-sign webhook can update signing status. Run once per database,
 * and again whenever the secret changes:
 *
 *   npm run esign:setup
 *
 * The secret itself never leaves .env.local.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { z } from "zod";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const env = z
  .object({
    DATABASE_URL: z.url("Set DATABASE_URL in .env.local first."),
    ESIGN_RELAY_SECRET: z
      .string("Set ESIGN_RELAY_SECRET (32 or more characters) in .env.local first.")
      .min(32, "Set ESIGN_RELAY_SECRET (32 or more characters) in .env.local first."),
  })
  .safeParse(process.env);

async function main() {
  if (!env.success) {
    for (const issue of env.error.issues) console.error(issue.message);
    process.exitCode = 1;
    return;
  }
  const hash = createHash("sha256").update(env.data.ESIGN_RELAY_SECRET).digest("hex");
  const sql = postgres(env.data.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`
      insert into private.esign_settings (relay_secret_hash) values (${hash})
      on conflict (id) do update set relay_secret_hash = excluded.relay_secret_hash, updated_at = now()`;
    console.log("E-signing is set up: the webhook relay secret is stored (as a hash).");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
