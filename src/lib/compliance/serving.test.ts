import { describe, expect, it } from "vitest";
import { defaultServeMessage, recipientsFrom, serveEmail, type ServeTenancyRow } from "./serving";

const tenancy = (
  id: string,
  status: string,
  room: string,
  tenants: { id: string; first: string; email: string | null; linkStatus?: string }[],
): ServeTenancyRow => ({
  id,
  status,
  rooms: { name: room },
  tenancy_tenants: tenants.map((tenant) => ({
    status: tenant.linkStatus ?? "active",
    tenants: { id: tenant.id, first_name: tenant.first, last_name: "Tenant", email: tenant.email },
  })),
});

describe("recipientsFrom", () => {
  it("includes tenants on current, ending and upcoming tenancies only", () => {
    const recipients = recipientsFrom([
      tenancy("t1", "active", "Room 2", [{ id: "a", first: "Ana", email: "ana@example.test" }]),
      tenancy("t2", "prospective", "Room 10", [{ id: "b", first: "Ben", email: "  " }]),
      tenancy("t3", "ended", "Room 1", [{ id: "c", first: "Cai", email: "cai@example.test" }]),
      tenancy("t4", "ending", "Room 1", [
        { id: "d", first: "Dee", email: "dee@example.test" },
        { id: "e", first: "Eve", email: "eve@example.test", linkStatus: "removed" },
      ]),
      tenancy("t5", "cancelled", "Room 3", [{ id: "f", first: "Fin", email: "fin@example.test" }]),
    ]);
    expect(recipients.map((r) => [r.roomName, r.name, r.email])).toEqual([
      ["Room 1", "Dee Tenant", "dee@example.test"],
      ["Room 2", "Ana Tenant", "ana@example.test"],
      ["Room 10", "Ben Tenant", null],
    ]);
  });
});

describe("serveEmail", () => {
  it("greets the tenant, keeps paragraphs and points to the portal", () => {
    const email = serveEmail({
      firstName: "Ana",
      message: "Here it is.\n\nCall us with <questions>.",
      organisation: "Northside & Co",
    });
    expect(email.text).toBe(
      "Hi Ana,\n\nHere it is.\n\nCall us with <questions>.\n\nYou can also find it in your tenant portal, under More, then Documents.\n\nThanks,\nNorthside & Co",
    );
    expect(email.html).toContain("<p>Call us with &lt;questions&gt;.</p>");
    expect(email.html).toContain("Northside &amp; Co");
  });

  it("suggests a subject and message", () => {
    expect(defaultServeMessage("Gas safety certificate", "12 High Street")).toEqual({
      subject: "Your gas safety certificate for 12 High Street",
      message:
        "Here's the latest gas safety certificate for 12 High Street. It's attached to this email for your records.",
    });
  });
});
