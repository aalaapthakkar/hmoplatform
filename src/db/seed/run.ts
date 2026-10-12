/**
 * Seeds the demo organisation into the database in DATABASE_URL.
 *
 *   npm run db:seed
 *   npm run db:seed -- --email you@example.com   (also makes you its admin)
 *
 * Connects as the database owner, so it bypasses RLS. Never run it from app
 * code, and never print the email or any other personal data.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { DEMO_ORG_NAME } from "./data";
import { seedDemoOrg } from "./seed";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const argsSchema = z.object({
  DATABASE_URL: z.url("Set DATABASE_URL in .env.local first (see .env.example)."),
  email: z.email("That doesn't look like an email address.").optional(),
});

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" } } });
  const parsed = argsSchema.safeParse({ DATABASE_URL: process.env.DATABASE_URL, ...values });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(issue.message);
    process.exitCode = 1;
    return;
  }

  const client = postgres(parsed.data.DATABASE_URL, { max: 1, prepare: false });
  const db = drizzle({ client });
  try {
    let adminUserId: string | undefined;
    if (parsed.data.email) {
      const rows = await db.execute<{ id: string }>(
        sql`select id from public.users where lower(email) = lower(${parsed.data.email})`,
      );
      adminUserId = rows[0]?.id;
      if (!adminUserId) {
        console.error("No account uses that email address. Sign up in the app first, then rerun.");
        process.exitCode = 1;
        return;
      }
    }

    await seedDemoOrg(db, { adminUserId });
    console.log(`Seeded "${DEMO_ORG_NAME}": 3 properties and 12 rooms.`);
    if (adminUserId) console.log("You're an admin of the demo organisation.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Print only the message: a Postgres error's detail can quote row values.
  console.error(`Seeding failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
