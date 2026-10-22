import { timingSafeEqual } from "node:crypto";
import { sendComplianceReminders } from "@/lib/compliance/reminders";
import { EmailNotConfigured } from "@/lib/email";

/** Checks the caller's "Bearer <CRON_SECRET>" without leaking timing. */
function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return null;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected) ? secret : null;
}

/**
 * The daily compliance reminder emails, run by Vercel Cron (see
 * vercel.json) or `npm run compliance:remind`. The secret is checked here
 * and again by the database, which keeps only its hash.
 */
export async function GET(request: Request) {
  const secret = authorised(request);
  if (!secret) return new Response("Not allowed", { status: 401 });
  try {
    const run = await sendComplianceReminders(secret);
    return Response.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailNotConfigured) {
      return new Response("Email isn't set up", { status: 503 });
    }
    throw error;
  }
}
