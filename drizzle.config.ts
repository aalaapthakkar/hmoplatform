import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local ourselves.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  schemaFilter: ["public"],
  entities: { roles: { provider: "supabase" } },
  strict: true,
  verbose: true,
});
