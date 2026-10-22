/**
 * Sends today's compliance reminder emails now, the same way the daily
 * Vercel Cron job does. Needs the app running (npm run dev or start):
 *
 *   npm run compliance:remind
 *
 * Uses NEXT_PUBLIC_SITE_URL and CRON_SECRET from .env.local.
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) {
    console.error("Set NEXT_PUBLIC_SITE_URL and CRON_SECRET in .env.local first.");
    process.exitCode = 1;
    return;
  }
  const response = await fetch(new URL("/api/cron/compliance-reminders", site), {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Reminders didn't run (${response.status}): ${body}`);
    process.exitCode = 1;
    return;
  }
  const run = JSON.parse(body) as { people: number; sent: number; failed: number };
  console.log(
    `Compliance reminders: ${run.sent} sent, ${run.failed} failed, to ${run.people} people.`,
  );
}

main().catch((error: unknown) => {
  console.error(`Reminders failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
