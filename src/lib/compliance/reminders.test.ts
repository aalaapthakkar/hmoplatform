// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

const sent: { to: string; subject: string }[] = [];
let failFor = new Set<string>();
vi.mock("@/lib/email", async () => {
  class EmailFailed extends Error {}
  return {
    EmailFailed,
    getEmailProvider: () => ({
      name: "test",
      async send(message: { to: string; subject: string }) {
        if (failFor.has(message.to)) throw new EmailFailed("The email address wasn't accepted");
        sent.push({ to: message.to, subject: message.subject });
        return { id: "test-1" };
      },
    }),
  };
});

const row = (user: string, email: string, service: string, kind: "due_soon" | "overdue") => ({
  user_id: user,
  email,
  full_name: "Pat Example",
  org_id: "org-1",
  org_name: "Northside",
  property_service_id: `${user}-${service}`,
  property_id: "p1",
  property_label: "1 High Street, LS1 1AA",
  service_name: service,
  expires_on: "2026-11-01",
  kind,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hmo.example");
  sent.length = 0;
  failFor = new Set();
  rpc.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendComplianceReminders", () => {
  it("sends one email per person and records what went", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "compliance_reminder_batch"
        ? {
            data: [
              row("u1", "one@example.test", "Gas safety", "due_soon"),
              row("u1", "one@example.test", "EICR", "overdue"),
              row("u2", "two@example.test", "Gas safety", "due_soon"),
            ],
            error: null,
          }
        : { data: 3, error: null },
    );
    const { sendComplianceReminders } = await import("./reminders");
    const run = await sendComplianceReminders("s".repeat(40));

    expect(run).toEqual({ people: 2, sent: 2, failed: 0 });
    expect(sent).toEqual([
      { to: "one@example.test", subject: "1 compliance item is overdue at Northside" },
      { to: "two@example.test", subject: "1 compliance item is coming due at Northside" },
    ]);
    const recorded = rpc.mock.calls.find(([name]) => name === "record_compliance_reminders");
    expect(recorded?.[1].p_sent).toHaveLength(3);
  });

  it("doesn't record emails that failed, so they go again tomorrow", async () => {
    failFor = new Set(["two@example.test"]);
    rpc.mockImplementation(async (name: string) =>
      name === "compliance_reminder_batch"
        ? {
            data: [
              row("u1", "one@example.test", "Gas safety", "due_soon"),
              row("u2", "two@example.test", "EICR", "overdue"),
            ],
            error: null,
          }
        : { data: 1, error: null },
    );
    const { sendComplianceReminders } = await import("./reminders");
    const run = await sendComplianceReminders("s".repeat(40));

    expect(run).toEqual({ people: 2, sent: 1, failed: 1 });
    const recorded = rpc.mock.calls.find(([name]) => name === "record_compliance_reminders");
    expect(recorded?.[1].p_sent.map((entry: { user_id: string }) => entry.user_id)).toEqual(["u1"]);
  });

  it("does nothing when there's nothing to send", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { sendComplianceReminders } = await import("./reminders");
    expect(await sendComplianceReminders("s".repeat(40))).toEqual({
      people: 0,
      sent: 0,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
