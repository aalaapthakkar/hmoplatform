import "server-only";

import { createClient } from "@supabase/supabase-js";
import { EmailFailed, getEmailProvider } from "@/lib/email";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { buildDigest, type DigestItem } from "./digest";

type BatchRow = Database["public"]["Functions"]["compliance_reminder_batch"]["Returns"][number];

/**
 * A database client with no session at all. The reminder functions only
 * answer to it, and only with the cron secret.
 */
function signedOutClient() {
  const env = getPublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export type ReminderRun = { people: number; sent: number; failed: number };

/**
 * Sends today's compliance reminders: one email per person (per
 * organisation) listing what has entered its alert window or gone overdue
 * since they were last told. What was sent is recorded so it isn't sent
 * again; failures are tried again tomorrow. Never logs personal data.
 */
export async function sendComplianceReminders(secret: string): Promise<ReminderRun> {
  const supabase = signedOutClient();
  const { data, error } = await supabase.rpc("compliance_reminder_batch", { p_secret: secret });
  if (error) throw new Error("Couldn't read the reminders", { cause: error.code });

  const groups = new Map<string, BatchRow[]>();
  for (const row of data) {
    const key = `${row.user_id}:${row.org_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const provider = getEmailProvider();
  const siteUrl = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const sentRows: BatchRow[] = [];
  let failed = 0;

  for (const rows of groups.values()) {
    const first = rows[0]!;
    const digest = buildDigest({
      firstName: first.full_name?.trim().split(/\s+/)[0] ?? null,
      organisation: first.org_name,
      siteUrl,
      items: rows.map((row): DigestItem => ({
        propertyId: row.property_id,
        propertyLabel: row.property_label,
        serviceName: row.service_name,
        expiresOn: row.expires_on,
        kind: row.kind,
      })),
    });
    try {
      await provider.send({ to: first.email, ...digest });
      sentRows.push(...rows);
    } catch (sendError) {
      if (!(sendError instanceof EmailFailed)) throw sendError;
      failed += 1;
    }
  }

  if (sentRows.length > 0) {
    const { error: recordError } = await supabase.rpc("record_compliance_reminders", {
      p_secret: secret,
      p_sent: sentRows.map((row) => ({
        property_service_id: row.property_service_id,
        expires_on: row.expires_on,
        kind: row.kind,
        user_id: row.user_id,
      })),
    });
    if (recordError) throw new Error("Couldn't record the reminders", { cause: recordError.code });
  }

  return { people: groups.size, sent: groups.size - failed, failed };
}
