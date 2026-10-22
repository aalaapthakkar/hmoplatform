// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createTestDatabase,
  installSupabaseStubs,
  type TestDatabase,
} from "./testing/pglite";
import { todayInLondon } from "@/lib/format";

/**
 * The compliance engine in the database: default service types, the
 * compliance_items view's statuses, extra-field rules, the daily job that
 * opens maintenance jobs, and the reminder data behind the daily email.
 */

const ALICE = "61111111-1111-4111-8111-111111111111"; // admin, Alice Lettings
const CAROL = "63333333-3333-4333-8333-333333333333"; // staff, Alice Lettings
const BOB = "62222222-2222-4222-8222-222222222222"; // admin, Bob Homes

const SEEDED = [
  "boiler_service",
  "building_insurance",
  "damp_mould",
  "eicr",
  "emergency_lighting",
  "epc",
  "fire_doors",
  "fire_extinguishers",
  "gas_safety",
  "hmo_licence",
  "landlord_registration",
  "pat",
  "smoke_alarms",
];

const CRON_SECRET = randomBytes(32).toString("base64url");

let t: TestDatabase;
let db: PGlite;
let aliceOrg: string;
let bobOrg: string;

async function property(org: string, name = "1 Compliance Court") {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.properties (org_id, address_line_1, town, postcode, ownership_type) values ($1, $2, 'Leeds', 'LS6 1AA', 'owned') returning id",
    [org, name],
  );
  return rows[0]!.id;
}

async function typeId(org: string, key: string) {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.service_types where org_id = $1 and system_key = $2",
    [org, key],
  );
  return rows[0]!.id;
}

async function certificate(org: string, propertyId: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.documents (org_id, document_type, file_path, file_name, property_id) values ($1, 'gas_safety', $1::uuid::text || '/cert.pdf', 'cert.pdf', $2) returning id",
    [org, propertyId],
  );
  return rows[0]!.id;
}

/** Sets an item's expiry to today plus some days, with or without a certificate. */
async function expiresIn(
  org: string,
  propertyId: string,
  key: string,
  days: number,
  withCertificate = true,
) {
  const document = withCertificate ? await certificate(org, propertyId) : null;
  await db.query(
    `insert into public.property_services (org_id, property_id, service_type_id, expires_on, document_id)
     values ($1, $2, $3, private.today_in_london() + $4::int, $5)
     on conflict (property_id, service_type_id)
     do update set expires_on = excluded.expires_on, document_id = excluded.document_id`,
    [org, propertyId, await typeId(org, key), days, document],
  );
}

async function statuses(propertyId: string, user = ALICE) {
  const { rows } = await t.asUser(user, () =>
    db.query<{ system_key: string; status: string }>(
      "select system_key, status from public.compliance_items where property_id = $1 order by system_key",
      [propertyId],
    ),
  );
  return Object.fromEntries(rows.map((row) => [row.system_key, row.status]));
}

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
  await t.createAuthUser(ALICE, "alice@compliance.test", "Alice Admin");
  await t.createAuthUser(CAROL, "carol@compliance.test", "Carol Staff");
  await t.createAuthUser(BOB, "bob@compliance.test", "Bob Admin");
  aliceOrg = await t.createOrg(ALICE, "Alice Lettings");
  bobOrg = await t.createOrg(BOB, "Bob Homes");
  await db.query(
    "insert into public.memberships (org_id, user_id, role) values ($1, $2, 'staff')",
    [aliceOrg, CAROL],
  );
  await db.query("insert into private.app_secrets (name, secret_hash) values ('cron', $1)", [
    createHash("sha256").update(CRON_SECRET).digest("hex"),
  ]);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("service types", () => {
  it("gives every new organisation the standard types, once", async () => {
    const { rows } = await db.query<{ system_key: string }>(
      "select system_key from public.service_types where org_id = $1 order by system_key",
      [aliceOrg],
    );
    expect(rows.map((row) => row.system_key)).toEqual(SEEDED);
    await db.query("select private.add_default_service_types($1)", [aliceOrg]);
    const again = await db.query<{ n: number }>(
      "select count(*)::int as n from public.service_types where org_id = $1",
      [aliceOrg],
    );
    expect(again.rows[0]!.n).toBe(SEEDED.length);
  });

  it("seeds the HMO licence's extra fields and the registration's renewal date", async () => {
    const { rows } = await db.query<{
      system_key: string;
      fields: { key: string }[];
      expiry_label: string;
      validity_months: number | null;
    }>(
      "select system_key, fields, expiry_label, validity_months from public.service_types where org_id = $1 and system_key in ('hmo_licence', 'landlord_registration') order by system_key",
      [aliceOrg],
    );
    expect(rows[0]!.fields.map((field) => field.key)).toEqual([
      "licence_number",
      "scheme",
      "max_occupants",
      "max_households",
      "conditions",
    ]);
    expect(rows[1]).toMatchObject({ expiry_label: "Renewal date", validity_months: null });
  });

  it("lets admins, not staff, change types", async () => {
    const gas = await typeId(aliceOrg, "gas_safety");
    const byStaff = await t.asUser(CAROL, () =>
      db.query("update public.service_types set alert_window_days = 10 where id = $1", [gas]),
    );
    expect(byStaff.affectedRows).toBe(0);
    await expect(
      t.asUser(CAROL, () =>
        db.query(
          "insert into public.service_types (org_id, name, category) values ($1, 'Lift', 'other')",
          [aliceOrg],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const byAdmin = await t.asUser(
      ALICE,
      () => db.query("update public.service_types set alert_window_days = 45 where id = $1", [gas]),
      true,
    );
    expect(byAdmin.affectedRows).toBe(1);
  });

  it("checks extra field definitions", async () => {
    const bad = [
      [{ key: "Licence No", label: "Licence", kind: "text" }],
      [{ key: "scheme", label: "Scheme", kind: "choice" }],
      [{ key: "size", label: "Size", kind: "colour" }],
      [
        { key: "ref", label: "Reference", kind: "text" },
        { key: "ref", label: "Other reference", kind: "text" },
      ],
    ];
    for (const fields of bad) {
      await expect(
        t.asUser(ALICE, () =>
          db.query(
            "insert into public.service_types (org_id, name, category, fields) values ($1, 'Lift service', 'other', $2)",
            [aliceOrg, JSON.stringify(fields)],
          ),
        ),
      ).rejects.toThrow(/extra field/);
    }
  });
});

describe("item details", () => {
  it("only accepts answers to the type's own fields, of the right kind", async () => {
    const propertyId = await property(aliceOrg);
    const licence = await typeId(aliceOrg, "hmo_licence");
    const save = (details: object) =>
      t.asUser(ALICE, () =>
        db.query(
          "insert into public.property_services (org_id, property_id, service_type_id, details) values ($1, $2, $3, $4)",
          [aliceOrg, propertyId, licence, JSON.stringify(details)],
        ),
      );
    await expect(save({ colour: "blue" })).rejects.toThrow(/isn't one this type records/);
    await expect(save({ max_occupants: "six" })).rejects.toThrow(/Maximum occupants/);
    await expect(save({ scheme: "Optional" })).rejects.toThrow(/Scheme/);
    await expect(
      save({
        licence_number: "HMO/2026/001",
        scheme: "Mandatory",
        max_occupants: 6,
        conditions: null,
      }),
    ).resolves.toBeDefined();
  });

  it("needs a reason to mark something not needed", async () => {
    const propertyId = await property(aliceOrg);
    await expect(
      t.asUser(ALICE, async () =>
        db.query(
          "insert into public.property_services (org_id, property_id, service_type_id, not_required, not_required_reason) values ($1, $2, $3, true, '  ')",
          [aliceOrg, propertyId, await typeId(aliceOrg, "gas_safety")],
        ),
      ),
    ).rejects.toThrow(/not_required_reason/);
  });
});

describe("compliance_items status", () => {
  it("is missing until recorded, then ok, due soon or overdue by date", async () => {
    const propertyId = await property(aliceOrg);
    // Gas: 45-day window (changed above). EICR: 90 days. Smoke alarms: 7 days, no certificate.
    await expiresIn(aliceOrg, propertyId, "eicr", 200);
    await expiresIn(aliceOrg, propertyId, "epc", 90);
    await expiresIn(aliceOrg, propertyId, "smoke_alarms", 7, false);
    await expiresIn(aliceOrg, propertyId, "boiler_service", 0);
    await expiresIn(aliceOrg, propertyId, "pat", -1);
    await expiresIn(aliceOrg, propertyId, "fire_doors", 31, false);
    await expiresIn(aliceOrg, propertyId, "emergency_lighting", 300, false);

    const status = await statuses(propertyId);
    expect(status).toMatchObject({
      eicr: "ok",
      epc: "due_soon", // the last day of its 90-day window
      smoke_alarms: "due_soon", // 7 days out, 7-day window
      boiler_service: "due_soon", // expires today
      pat: "overdue", // expired yesterday
      fire_doors: "ok", // the day before its 30-day window
      emergency_lighting: "missing", // certificate required but not uploaded
      gas_safety: "missing", // never recorded
    });
  });

  it("shows not needed items as not needed, whatever their dates", async () => {
    const propertyId = await property(aliceOrg);
    const gas = await typeId(aliceOrg, "gas_safety");
    await t.asUser(
      ALICE,
      () =>
        db.query(
          "insert into public.property_services (org_id, property_id, service_type_id, not_required, not_required_reason) values ($1, $2, $3, true, 'All-electric house')",
          [aliceOrg, propertyId, gas],
        ),
      true,
    );
    expect((await statuses(propertyId)).gas_safety).toBe("not_needed");
  });

  it("follows each type's alert window", async () => {
    const propertyId = await property(aliceOrg);
    await expiresIn(aliceOrg, propertyId, "gas_safety", 50);
    expect((await statuses(propertyId)).gas_safety).toBe("ok"); // window is 45 days now
    await expiresIn(aliceOrg, propertyId, "gas_safety", 45);
    expect((await statuses(propertyId)).gas_safety).toBe("due_soon");
  });

  it("only shows an organisation its own properties, and nothing to tenants or visitors", async () => {
    const bobProperty = await property(bobOrg, "1 Bob Street");
    const seenByAlice = await t.asUser(ALICE, () =>
      db.query("select 1 from public.compliance_items where property_id = $1", [bobProperty]),
    );
    expect(seenByAlice.rows).toEqual([]);
    const seenByBob = await t.asUser(BOB, () =>
      db.query("select 1 from public.compliance_items where property_id = $1", [bobProperty]),
    );
    expect(seenByBob.rows).toHaveLength(SEEDED.length);
    await expect(t.asAnon(() => db.query("select * from public.compliance_items"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("leaves out archived types and archived properties", async () => {
    const propertyId = await property(aliceOrg);
    const pat = await typeId(aliceOrg, "pat");
    await t.asUser(
      ALICE,
      () => db.query("update public.service_types set status = 'archived' where id = $1", [pat]),
      true,
    );
    expect((await statuses(propertyId)).pat).toBeUndefined();
    await db.query("update public.properties set status = 'archived' where id = $1", [propertyId]);
    expect(await statuses(propertyId)).toEqual({});
    await db.query("update public.service_types set status = 'active' where id = $1", [pat]);
  });
});

describe("daily compliance job", () => {
  it("opens one maintenance job per item due, for types that ask for one", async () => {
    const propertyId = await property(aliceOrg, "1 Jobs Lane");
    await expiresIn(aliceOrg, propertyId, "boiler_service", 10); // auto job, in window
    await expiresIn(aliceOrg, propertyId, "fire_doors", 200, false); // auto job, not yet due
    await expiresIn(aliceOrg, propertyId, "epc", 10); // no auto job
    await expiresIn(aliceOrg, propertyId, "pat", -3); // auto job, overdue

    await db.query("select private.run_daily_compliance()");
    await db.query("select private.run_daily_compliance()");
    const { rows } = await db.query<{ title: string; urgency: string }>(
      "select title, urgency from public.maintenance_requests where property_id = $1 order by title",
      [propertyId],
    );
    expect(
      rows.map((row) => [row.title.replace(/\d{2}\/\d{2}\/\d{4}/, "DATE"), row.urgency]),
    ).toEqual([
      ["Boiler service due by DATE", "normal"],
      ["Portable appliance testing (PAT) due by DATE", "urgent"],
    ]);

    // Renewed with a new expiry date: a new job comes when that one falls due.
    await expiresIn(aliceOrg, propertyId, "boiler_service", 20);
    await db.query("select private.run_daily_compliance()");
    const after = await db.query<{ n: number }>(
      "select count(*)::int as n from public.maintenance_requests where property_id = $1",
      [propertyId],
    );
    expect(after.rows[0]!.n).toBe(3);
  });
});

describe("reminder emails", () => {
  const batch = (secret = CRON_SECRET) =>
    t.asAnon(() =>
      db.query<{
        email: string;
        service_name: string;
        kind: string;
        property_label: string;
        user_id: string;
        property_service_id: string;
        expires_on: string;
      }>(
        "select email, service_name, kind, property_label, user_id, property_service_id, to_char(expires_on, 'YYYY-MM-DD') as expires_on from public.compliance_reminder_batch($1) order by email, service_name",
        [secret],
      ),
    );

  it("refuses without the right secret", async () => {
    await expect(batch("not-the-secret-not-the-secret-not-the-secret")).rejects.toThrow(
      /Not allowed/,
    );
    await expect(
      t.asAnon(() => db.query("select public.record_compliance_reminders('x', '[]')")),
    ).rejects.toThrow(/Not allowed/);
  });

  it("goes to members who want reminders, once per item, expiry and kind", async () => {
    const bobProperty = await property(bobOrg, "7 Reminder Road");
    await expiresIn(bobOrg, bobProperty, "gas_safety", 20);
    await expiresIn(bobOrg, bobProperty, "eicr", -2);
    await expiresIn(bobOrg, bobProperty, "epc", 500);

    const first = await batch();
    const bobs = first.rows.filter((row) => row.email === "bob@compliance.test");
    expect(bobs.map((row) => [row.service_name, row.kind, row.property_label])).toEqual([
      ["Electrical installation condition report (EICR)", "overdue", "7 Reminder Road, LS6 1AA"],
      ["Gas safety certificate", "due_soon", "7 Reminder Road, LS6 1AA"],
    ]);
    // Carol (staff) hasn't asked for reminders; Alice's items aren't Bob's.
    expect(first.rows.some((row) => row.email === "carol@compliance.test")).toBe(false);
    expect(bobs.every((row) => row.property_label.startsWith("7 Reminder Road"))).toBe(true);

    await db.query("select public.record_compliance_reminders($1, $2)", [
      CRON_SECRET,
      JSON.stringify(
        bobs.map(({ property_service_id, expires_on, kind, user_id }) => ({
          property_service_id,
          expires_on,
          kind,
          user_id,
        })),
      ),
    ]);
    const second = await batch();
    expect(second.rows.filter((row) => row.email === "bob@compliance.test")).toEqual([]);
  });

  it("includes staff who opt in, and stops when they opt out", async () => {
    await t.asUser(CAROL, () => db.query("select public.set_my_compliance_emails(true)"), true);
    expect((await batch()).rows.some((row) => row.email === "carol@compliance.test")).toBe(true);
    await t.asUser(CAROL, () => db.query("select public.set_my_compliance_emails(false)"), true);
    expect((await batch()).rows.some((row) => row.email === "carol@compliance.test")).toBe(false);
  });

  it("catches up on a missed day, and reminds again when an item goes overdue", async () => {
    const bobProperty = await property(bobOrg, "8 Catch Up Close");
    await expiresIn(bobOrg, bobProperty, "boiler_service", 3);
    const dueSoon = await t.asAnon(() =>
      db.query<{ kind: string }>(
        "select kind from public.compliance_reminder_batch($1, $2::date + 1) where property_label like '8 Catch Up%'",
        [CRON_SECRET, todayInLondon()],
      ),
    );
    expect(dueSoon.rows.map((row) => row.kind)).toEqual(["due_soon"]);
    const later = await t.asAnon(() =>
      db.query<{ kind: string }>(
        "select kind from public.compliance_reminder_batch($1, $2::date + 10) where property_label like '8 Catch Up%'",
        [CRON_SECRET, todayInLondon()],
      ),
    );
    expect(later.rows.map((row) => row.kind)).toEqual(["overdue"]);
  });

  it("turns reminders on for admins who join, and off for staff", async () => {
    const { rows } = await db.query<{ role: string; compliance_emails: boolean }>(
      "select role, compliance_emails from public.memberships where org_id = $1 order by role",
      [aliceOrg],
    );
    expect(rows).toEqual([
      { role: "admin", compliance_emails: true },
      { role: "staff", compliance_emails: false },
    ]);
  });
});

describe("serving certificates", () => {
  it("keeps the record of who it went to unchangeable", async () => {
    const propertyId = await property(aliceOrg, "3 Served Street");
    const document = await certificate(aliceOrg, propertyId);
    const service = await t.asUser(
      ALICE,
      async () =>
        (
          await db.query<{ id: string }>(
            "insert into public.certificate_services (org_id, property_id, document_id, subject, message, sent_by) values ($1, $2, $3, 'Your gas safety certificate', 'Attached.', $4) returning id",
            [aliceOrg, propertyId, document, ALICE],
          )
        ).rows[0]!.id,
      true,
    );
    await expect(
      t.asUser(ALICE, () =>
        db.query("update public.certificate_services set subject = 'Changed' where id = $1", [
          service,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update public.certificate_services set subject = 'Changed' where id = $1", [
        service,
      ]),
    ).rejects.toThrow(/can't be changed/);
  });
});

describe("starting from existing certificates (0027)", () => {
  it("turns the newest property certificates into compliance items", async () => {
    const legacy = new PGlite();
    await installSupabaseStubs(legacy);
    await applyMigrations(legacy, { before: "0027" });
    const org = (
      await legacy.query<{ id: string }>(
        "insert into public.organisations (name) values ('Old Org') returning id",
      )
    ).rows[0]!.id;
    const propertyId = (
      await legacy.query<{ id: string }>(
        "insert into public.properties (org_id, address_line_1, town, postcode, ownership_type) values ($1, '1 Old Road', 'Leeds', 'LS6 1AA', 'owned') returning id",
        [org],
      )
    ).rows[0]!.id;
    for (const [type, expiry, name] of [
      ["gas_safety", "2025-03-01", "old-gas.pdf"],
      ["gas_safety", "2026-03-01", "new-gas.pdf"],
      ["epc", null, "epc.pdf"],
      ["inventory", "2027-01-01", "inventory.pdf"],
    ]) {
      await legacy.query(
        "insert into public.documents (org_id, document_type, file_path, file_name, property_id, expiry_date) values ($1, $2, $1::uuid::text || '/' || $4, $4, $3, $5)",
        [org, type, propertyId, name, expiry],
      );
    }

    await applyMigrations(legacy, { from: "0027" });

    const { rows } = await legacy.query<{
      system_key: string;
      expires: string | null;
      file_name: string;
    }>(
      `select t.system_key, to_char(ps.expires_on, 'YYYY-MM-DD') as expires, d.file_name
       from public.property_services ps
       join public.service_types t on t.id = ps.service_type_id
       join public.documents d on d.id = ps.document_id
       order by t.system_key`,
    );
    expect(rows).toEqual([
      { system_key: "epc", expires: null, file_name: "epc.pdf" },
      { system_key: "gas_safety", expires: "2026-03-01", file_name: "new-gas.pdf" },
    ]);
    const types = await legacy.query<{ n: number }>(
      "select count(*)::int as n from public.service_types where org_id = $1",
      [org],
    );
    expect(types.rows[0]!.n).toBe(SEEDED.length);
    await legacy.close();
  }, 120_000);
});
