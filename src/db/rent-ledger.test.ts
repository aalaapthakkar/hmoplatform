// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createTestDatabase,
  installSupabaseStubs,
  type TestDatabase,
} from "./testing/pglite";

/**
 * The rent ledger in the database: the rent schedule (pro rata first and
 * last periods, monthly and weekly), the daily job, and the append-only
 * rules with reversals. Dates are fixed by calling the schedule "as of" a
 * day, so nothing depends on today.
 */

const ALICE = "51111111-1111-4111-8111-111111111111";
const BOB = "52222222-2222-4222-8222-222222222222";

let t: TestDatabase;
let db: PGlite;
let aliceOrg: string;
let bobOrg: string;

/** Monthly part periods: rent x 12 / 365 a day, rounded down. */
const monthlyPart = (rent: number, days: number) => Math.floor((rent * 12 * days) / 365);
/** Weekly part periods: rent / 7 a day, rounded down. */
const weeklyPart = (rent: number, days: number) => Math.floor((rent * days) / 7);

async function propertyFor(org: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.properties (org_id, address_line_1, town, postcode, ownership_type) values ($1, '9 Ledger Lane', 'Leeds', 'LS6 1AA', 'owned') returning id",
    [org],
  );
  return rows[0]!.id;
}

type TenancyOptions = {
  start: string;
  dueDay: number;
  rent: number;
  frequency?: "monthly" | "weekly";
  /** Sets the tenancy to ending (or ended) with this last day. */
  end?: string;
  status?: "prospective" | "active" | "ending" | "ended" | "cancelled";
  org?: string;
};

/** A tenancy in its own room (one current tenancy per room), made as the database owner. */
async function tenancy(options: TenancyOptions) {
  const org = options.org ?? aliceOrg;
  const property = await propertyFor(org);
  const room = (
    await db.query<{ id: string }>(
      "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Ledger room') returning id",
      [org, property],
    )
  ).rows[0]!.id;
  const status = options.status ?? (options.end ? "ending" : "active");
  const ends = status === "ending" || status === "ended";
  const { rows } = await db.query<{ id: string }>(
    `insert into public.tenancies
       (org_id, room_id, start_date, end_date, end_reason, status, rent_pence, rent_frequency, rent_due_day)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      org,
      room,
      options.start,
      ends ? options.end : null,
      ends ? "tenant_notice" : null,
      status,
      options.rent,
      options.frequency ?? "monthly",
      options.dueDay,
    ],
  );
  return rows[0]!.id;
}

/** Runs the schedule for a tenancy as of a date; returns how many charges it added. */
async function run(tenancyId: string, asOf: string) {
  const { rows } = await db.query<{ n: number }>(
    "select private.sync_rent_charges_as_of($1, $2) as n",
    [tenancyId, asOf],
  );
  return rows[0]!.n;
}

/** The charges that stand (not reversals, not reversed), as "DD/MM-DD/MM" and pence. */
async function standing(tenancyId: string) {
  const { rows } = await db.query<{ period: string; amount: number }>(
    `select to_char(c.period_start, 'DD/MM') || '-' || to_char(c.period_end, 'DD/MM') as period,
            c.amount_pence as amount
     from public.rent_charges c
     where c.tenancy_id = $1 and c.reverses_charge_id is null
       and not exists (select 1 from public.rent_charges r where r.reverses_charge_id = c.id)
     order by c.period_start, c.created_at`,
    [tenancyId],
  );
  return rows;
}

/** The reversals on a tenancy: which period they cancel, and why. */
async function reversals(tenancyId: string) {
  const { rows } = await db.query<{ period: string; reason: string; amount: number }>(
    `select to_char(c.period_start, 'DD/MM') || '-' || to_char(c.period_end, 'DD/MM') as period,
            r.description as reason, r.amount_pence as amount
     from public.rent_charges r join public.rent_charges c on c.id = r.reverses_charge_id
     where r.tenancy_id = $1
     order by r.created_at, c.period_start`,
    [tenancyId],
  );
  return rows;
}

async function setEnd(tenancyId: string, end: string) {
  await db.query(
    "update public.tenancies set status = 'ending', end_date = $2, end_reason = 'tenant_notice' where id = $1",
    [tenancyId, end],
  );
}

/** Adds days to a YYYY-MM-DD date. */
function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
  await t.createAuthUser(ALICE, "alice@ledger.test");
  await t.createAuthUser(BOB, "bob@ledger.test");
  aliceOrg = await t.createOrg(ALICE, "Alice Lettings");
  bobOrg = await t.createOrg(BOB, "Bob Homes");
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("monthly rent", () => {
  it("charges a whole month in advance on the due day", async () => {
    const id = await tenancy({ start: "2026-01-01", dueDay: 1, rent: 60000 });
    expect(await run(id, "2026-03-15")).toBe(3);
    expect(await standing(id)).toEqual([
      { period: "01/01-31/01", amount: 60000 },
      { period: "01/02-28/02", amount: 60000 },
      { period: "01/03-31/03", amount: 60000 },
    ]);
  });

  it("charges nothing before the start date, and the first period on it", async () => {
    const id = await tenancy({ start: "2026-01-15", dueDay: 1, rent: 60000 });
    expect(await run(id, "2026-01-14")).toBe(0);
    expect(await run(id, "2026-01-15")).toBe(1);
    expect(await standing(id)).toEqual([{ period: "15/01-31/01", amount: monthlyPart(60000, 17) }]);
  });

  it("charges a first part month by the day, then whole months", async () => {
    const id = await tenancy({ start: "2026-01-15", dueDay: 1, rent: 60000 });
    await run(id, "2026-02-01");
    expect(await standing(id)).toEqual([
      { period: "15/01-31/01", amount: monthlyPart(60000, 17) },
      { period: "01/02-28/02", amount: 60000 },
    ]);
    // 60000 x 12 x 17 / 365 = 33534.24..., rounded down.
    expect(monthlyPart(60000, 17)).toBe(33534);
  });

  it("charges a last part month by the day, and nothing after the end", async () => {
    const id = await tenancy({ start: "2026-01-01", dueDay: 1, rent: 60000, end: "2026-03-10" });
    await run(id, "2026-05-01");
    expect(await standing(id)).toEqual([
      { period: "01/01-31/01", amount: 60000 },
      { period: "01/02-28/02", amount: 60000 },
      { period: "01/03-10/03", amount: monthlyPart(60000, 10) },
    ]);
  });

  it("charges a stay shorter than one period by the day", async () => {
    const id = await tenancy({ start: "2026-01-10", dueDay: 1, rent: 60000, end: "2026-01-20" });
    await run(id, "2026-02-15");
    expect(await standing(id)).toEqual([{ period: "10/01-20/01", amount: monthlyPart(60000, 11) }]);
  });

  it("moves a due day of 31 to the last day of shorter months", async () => {
    const id = await tenancy({ start: "2026-01-31", dueDay: 31, rent: 60000 });
    await run(id, "2026-05-01");
    expect(await standing(id)).toEqual([
      { period: "31/01-27/02", amount: 60000 },
      { period: "28/02-30/03", amount: 60000 },
      { period: "31/03-29/04", amount: 60000 },
      { period: "30/04-30/05", amount: 60000 },
    ]);
  });

  it("handles due days of 29 and 30 in February, in normal and leap years", async () => {
    const day29 = await tenancy({ start: "2026-01-29", dueDay: 29, rent: 50000 });
    await run(day29, "2026-03-29");
    expect(await standing(day29)).toEqual([
      { period: "29/01-27/02", amount: 50000 },
      { period: "28/02-28/03", amount: 50000 },
      { period: "29/03-28/04", amount: 50000 },
    ]);

    const day30 = await tenancy({ start: "2028-01-30", dueDay: 30, rent: 50000 });
    await run(day30, "2028-03-30");
    expect(await standing(day30)).toEqual([
      { period: "30/01-28/02", amount: 50000 },
      { period: "29/02-29/03", amount: 50000 },
      { period: "30/03-29/04", amount: 50000 },
    ]);
  });

  it("charges a part month by the day when moving in after the due day", async () => {
    const id = await tenancy({ start: "2026-02-20", dueDay: 15, rent: 73000 });
    await run(id, "2026-03-15");
    expect(await standing(id)).toEqual([
      { period: "20/02-14/03", amount: monthlyPart(73000, 23) },
      { period: "15/03-14/04", amount: 73000 },
    ]);
  });
});

describe("weekly rent", () => {
  // Wednesday 07/01/2026. ISO weekdays: 1 is Monday, 7 is Sunday.
  it.each([1, 2, 3, 4, 5, 6, 7])(
    "charges on weekday %i, with a first part week by the day",
    async (dueDay) => {
      const start = "2026-01-07";
      const id = await tenancy({ start, dueDay, rent: 14000, frequency: "weekly" });
      await run(id, "2026-01-27");

      const partDays = (dueDay - 3 + 7) % 7;
      const expected: { period: string; amount: number }[] = [];
      let due = start;
      if (partDays > 0) {
        expected.push({
          period: `${ddmm(start)}-${ddmm(addDays(start, partDays - 1))}`,
          amount: weeklyPart(14000, partDays),
        });
        due = addDays(start, partDays);
      }
      while (due <= "2026-01-27") {
        expected.push({ period: `${ddmm(due)}-${ddmm(addDays(due, 6))}`, amount: 14000 });
        due = addDays(due, 7);
      }
      expect(await standing(id)).toEqual(expected);
    },
  );

  it("charges a last part week by the day", async () => {
    // Monday 05/01/2026 to Wednesday 21/01/2026, due on Mondays.
    const id = await tenancy({
      start: "2026-01-05",
      dueDay: 1,
      rent: 15000,
      frequency: "weekly",
      end: "2026-01-21",
    });
    await run(id, "2026-02-01");
    expect(await standing(id)).toEqual([
      { period: "05/01-11/01", amount: 15000 },
      { period: "12/01-18/01", amount: 15000 },
      { period: "19/01-21/01", amount: weeklyPart(15000, 3) },
    ]);
    expect(weeklyPart(15000, 3)).toBe(6428);
  });
});

describe("when the end date changes", () => {
  it("reverses a whole month charged before notice, and charges the part month", async () => {
    const id = await tenancy({ start: "2026-01-01", dueDay: 1, rent: 60000 });
    await run(id, "2026-03-01");
    expect(await standing(id)).toHaveLength(3);

    // Notice: the tenancy now ends on 10/03.
    await setEnd(id, "2026-03-10");
    expect(await run(id, "2026-03-05")).toBe(1);
    expect(await standing(id)).toEqual([
      { period: "01/01-31/01", amount: 60000 },
      { period: "01/02-28/02", amount: 60000 },
      { period: "01/03-10/03", amount: monthlyPart(60000, 10) },
    ]);
    expect(await reversals(id)).toEqual([
      {
        period: "01/03-31/03",
        reason: "Rent recalculated: the tenancy ends on 10/03/2026",
        amount: 60000,
      },
    ]);

    // The end date moves to 20/03, then back to 10/03: each time the old part
    // month is reversed and the new one charged.
    await setEnd(id, "2026-03-20");
    expect(await run(id, "2026-03-06")).toBe(1);
    expect((await standing(id)).at(-1)).toEqual({
      period: "01/03-20/03",
      amount: monthlyPart(60000, 20),
    });
    await setEnd(id, "2026-03-10");
    expect(await run(id, "2026-03-07")).toBe(1);
    expect((await standing(id)).at(-1)).toEqual({
      period: "01/03-10/03",
      amount: monthlyPart(60000, 10),
    });
    expect(await run(id, "2026-03-08")).toBe(0);
    expect(await reversals(id)).toHaveLength(3);
  });

  it("reverses charges for periods after an earlier end date", async () => {
    const id = await tenancy({ start: "2026-01-01", dueDay: 1, rent: 60000 });
    await run(id, "2026-03-01");
    await setEnd(id, "2026-02-14");
    await run(id, "2026-03-02");
    expect(await standing(id)).toEqual([
      { period: "01/01-31/01", amount: 60000 },
      { period: "01/02-14/02", amount: monthlyPart(60000, 14) },
    ]);
    expect((await reversals(id)).map((reversal) => reversal.period).sort()).toEqual([
      "01/02-28/02",
      "01/03-31/03",
    ]);
  });
});

describe("running the schedule", () => {
  it("adds nothing when run again", async () => {
    const id = await tenancy({ start: "2026-01-15", dueDay: 1, rent: 60000 });
    expect(await run(id, "2026-04-01")).toBe(4);
    expect(await run(id, "2026-04-01")).toBe(0);
    expect(await run(id, "2026-04-15")).toBe(0);
  });

  it("never charges a period again once staff have reversed it", async () => {
    const id = await tenancy({ start: "2026-01-01", dueDay: 1, rent: 60000 });
    await run(id, "2026-02-01");
    const february = (
      await db.query<{ id: string }>(
        "select id from public.rent_charges where tenancy_id = $1 and period_start = '2026-02-01'",
        [id],
      )
    ).rows[0]!.id;
    await t.asUser(
      ALICE,
      () =>
        db.query("select public.reverse_ledger_entry('charge', $1, 'Rent-free month agreed')", [
          february,
        ]),
      true,
    );
    expect(await run(id, "2026-02-10")).toBe(0);
    // Even when notice later shortens that month.
    await setEnd(id, "2026-02-20");
    expect(await run(id, "2026-02-11")).toBe(0);
    expect(await standing(id)).toEqual([{ period: "01/01-31/01", amount: 60000 }]);
  });

  it("never charges upcoming or cancelled tenancies", async () => {
    const upcoming = await tenancy({
      start: "2026-01-01",
      dueDay: 1,
      rent: 60000,
      status: "prospective",
    });
    const cancelled = await tenancy({
      start: "2026-01-01",
      dueDay: 1,
      rent: 60000,
      status: "cancelled",
    });
    expect(await run(upcoming, "2026-03-01")).toBe(0);
    expect(await run(cancelled, "2026-03-01")).toBe(0);
  });

  it("brings every organisation's tenancies up to date in the daily job, and logs the run", async () => {
    const alices = await tenancy({ start: "2030-01-01", dueDay: 1, rent: 50000 });
    const bobs = await tenancy({ start: "2030-01-10", dueDay: 10, rent: 45000, org: bobOrg });
    const longGone = await tenancy({
      start: "2029-01-01",
      dueDay: 1,
      rent: 50000,
      end: "2029-06-30",
      status: "ended",
    });

    await db.query("select private.run_daily_rent_charges('2030-02-15')");
    expect(await standing(alices)).toHaveLength(2);
    expect(await standing(bobs)).toHaveLength(2);
    // Ended more than 90 days before: left alone.
    expect(await standing(longGone)).toEqual([]);

    const before = await db.query<{ n: number }>(
      "select count(*)::int as n from public.rent_charges",
    );
    await db.query("select private.run_daily_rent_charges('2030-02-15')");
    const after = await db.query<{ n: number }>(
      "select count(*)::int as n from public.rent_charges",
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);

    const { rows } = await db.query<{ run_for: string; failures: number }>(
      "select to_char(run_for, 'YYYY-MM-DD') as run_for, failures from private.rent_job_runs order by id desc limit 1",
    );
    expect(rows).toEqual([{ run_for: "2030-02-15", failures: 0 }]);
  });

  it("tells staff, and only staff, when the job last ran", async () => {
    await db.query("select private.run_daily_rent_charges('2030-03-01')");
    const staff = await t.asUser(ALICE, () =>
      db.query<{ last: Date | null }>("select public.rent_charges_last_run() as last"),
    );
    expect(staff.rows[0]!.last).not.toBeNull();
    const nobody = await t.asUser("59999999-9999-4999-8999-999999999999", () =>
      db.query<{ last: Date | null }>("select public.rent_charges_last_run() as last"),
    );
    expect(nobody.rows[0]!.last).toBeNull();
  });
});

describe("append-only ledger", () => {
  let tenancyId: string;
  let chargeId: string;
  let paymentId: string;

  beforeAll(async () => {
    tenancyId = await tenancy({ start: "2026-01-01", dueDay: 1, rent: 60000 });
    await run(tenancyId, "2026-01-01");
    chargeId = (
      await db.query<{ id: string }>("select id from public.rent_charges where tenancy_id = $1", [
        tenancyId,
      ])
    ).rows[0]!.id;
    paymentId = (
      await db.query<{ id: string }>(
        "insert into public.rent_payments (org_id, tenancy_id, paid_on, amount_pence, method, reference) values ($1, $2, '2026-01-02', 60000, 'bank_transfer', 'JAN RENT') returning id",
        [aliceOrg, tenancyId],
      )
    ).rows[0]!.id;
  });

  it("never lets anyone edit a charge or a payment", async () => {
    for (const table of ["rent_charges", "rent_payments"]) {
      await expect(
        t.asUser(ALICE, () =>
          db.query(`update public.${table} set amount_pence = 1 where tenancy_id = $1`, [
            tenancyId,
          ]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(`update public.${table} set amount_pence = 1 where tenancy_id = $1`, [tenancyId]),
      ).rejects.toThrow(/can't be changed/);
    }
  });

  it("reverses a charge for the same amount, dated today, with the reason", async () => {
    const result = await t.asUser(ALICE, async () => {
      const { rows } = await db.query<{ id: string }>(
        "select public.reverse_ledger_entry('charge', $1, '  Charged by mistake ') as id",
        [chargeId],
      );
      return (
        await db.query(
          "select amount_pence, description, kind, period_start, created_by, due_date = private.today_in_london() as today from public.rent_charges where id = $1",
          [rows[0]!.id],
        )
      ).rows;
    });
    expect(result).toEqual([
      {
        amount_pence: 60000,
        description: "Charged by mistake",
        kind: "rent",
        period_start: null,
        created_by: ALICE,
        today: true,
      },
    ]);
  });

  it("reverses a payment, copying its amount, method and reference", async () => {
    const result = await t.asUser(ALICE, async () => {
      const { rows } = await db.query<{ id: string }>(
        "select public.reverse_ledger_entry('payment', $1, 'Bounced') as id",
        [paymentId],
      );
      return (
        await db.query(
          "select amount_pence, method, reference, note, recorded_by from public.rent_payments where id = $1",
          [rows[0]!.id],
        )
      ).rows;
    });
    expect(result).toEqual([
      {
        amount_pence: 60000,
        method: "bank_transfer",
        reference: "JAN RENT",
        note: "Bounced",
        recorded_by: ALICE,
      },
    ]);
  });

  it("copies the original's amount even if a reversal is written by hand", async () => {
    const amount = await t.asUser(ALICE, async () => {
      const { rows } = await db.query<{ amount_pence: number }>(
        "insert into public.rent_charges (org_id, tenancy_id, due_date, amount_pence, description, reverses_charge_id) values ($1, $2, '2026-01-05', 1, 'Typed by hand', $3) returning amount_pence",
        [aliceOrg, tenancyId, chargeId],
      );
      return rows[0]!.amount_pence;
    });
    expect(amount).toBe(60000);
  });

  it("reverses an entry only once, never reverses a reversal, and needs a reason", async () => {
    await t.asUser(
      ALICE,
      () => db.query("select public.reverse_ledger_entry('charge', $1, 'Mistake')", [chargeId]),
      true,
    );
    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.reverse_ledger_entry('charge', $1, 'Again')", [chargeId]),
      ),
    ).rejects.toThrow(/already been reversed/);

    const reversal = (
      await db.query<{ id: string }>(
        "select id from public.rent_charges where reverses_charge_id = $1",
        [chargeId],
      )
    ).rows[0]!.id;
    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.reverse_ledger_entry('charge', $1, 'Undo')", [reversal]),
      ),
    ).rejects.toThrow(/A reversal can't be reversed/);

    await expect(
      t.asUser(ALICE, () =>
        db.query("select public.reverse_ledger_entry('payment', $1, '   ')", [paymentId]),
      ),
    ).rejects.toThrow(/Give a reason/);
  });

  it("doesn't let another organisation reverse anything", async () => {
    await expect(
      t.asUser(BOB, () =>
        db.query("select public.reverse_ledger_entry('payment', $1, 'Not mine')", [paymentId]),
      ),
    ).rejects.toThrow(/isn't on this ledger/);
    await expect(
      t.asUser(BOB, () =>
        db.query(
          "insert into public.rent_payments (org_id, tenancy_id, paid_on, amount_pence, method, note, reverses_payment_id) values ($1, $2, '2026-01-05', 60000, 'cash', 'Sneaky', $3)",
          [bobOrg, tenancyId, paymentId],
        ),
      ),
    ).rejects.toThrow(/isn't on this ledger|foreign key/);
  });
});

describe("turning old voided entries into reversals (0023)", () => {
  it("keeps each void as a reversal with its reason, person and date", async () => {
    const legacy = new PGlite();
    await installSupabaseStubs(legacy);
    await applyMigrations(legacy, { before: "0023" });
    await legacy.query("insert into auth.users (id, email) values ($1, 'a@example.test')", [ALICE]);
    const org = (
      await legacy.query<{ id: string }>(
        "insert into public.organisations (name) values ('Old Org') returning id",
      )
    ).rows[0]!.id;
    const property = (
      await legacy.query<{ id: string }>(
        "insert into public.properties (org_id, address_line_1, town, postcode, ownership_type) values ($1, '1 Old Road', 'Leeds', 'LS6 1AA', 'owned') returning id",
        [org],
      )
    ).rows[0]!.id;
    const room = (
      await legacy.query<{ id: string }>(
        "insert into public.rooms (org_id, property_id, name) values ($1, $2, 'Room 1') returning id",
        [org, property],
      )
    ).rows[0]!.id;
    const tenancyId = (
      await legacy.query<{ id: string }>(
        "insert into public.tenancies (org_id, room_id, start_date, status, rent_pence) values ($1, $2, '2026-01-01', 'active', 50000) returning id",
        [org, room],
      )
    ).rows[0]!.id;
    await legacy.query(
      "insert into public.rent_charges (org_id, tenancy_id, kind, source, period_start, period_end, due_date, amount_pence, description, status, void_reason, voided_at, voided_by) values ($1, $2, 'rent', 'schedule', '2026-01-01', '2026-01-31', '2026-01-01', 50000, 'Rent 01/01/2026 to 31/01/2026', 'voided', 'Rent-free month', '2026-01-03 10:00+00', $3)",
      [org, tenancyId, ALICE],
    );
    await legacy.query(
      "insert into public.rent_payments (org_id, tenancy_id, paid_on, amount_pence, method, status, void_reason, voided_at, voided_by) values ($1, $2, '2026-01-02', 50000, 'cash', 'voided', 'Counted twice', '2026-01-04 10:00+00', $3)",
      [org, tenancyId, ALICE],
    );

    await applyMigrations(legacy, { from: "0023" });

    const charges = await legacy.query(
      "select description, amount_pence, to_char(due_date, 'YYYY-MM-DD') as due, created_by, source from public.rent_charges where reverses_charge_id is not null",
    );
    expect(charges.rows).toEqual([
      {
        description: "Rent-free month",
        amount_pence: 50000,
        due: "2026-01-03",
        created_by: ALICE,
        source: "manual",
      },
    ]);
    const payments = await legacy.query(
      "select note, amount_pence, to_char(paid_on, 'YYYY-MM-DD') as paid, recorded_by from public.rent_payments where reverses_payment_id is not null",
    );
    expect(payments.rows).toEqual([
      { note: "Counted twice", amount_pence: 50000, paid: "2026-01-04", recorded_by: ALICE },
    ]);
    // The reversed month stays reversed: the schedule doesn't charge it again.
    const added = await legacy.query<{ n: number }>(
      "select private.sync_rent_charges_as_of($1, '2026-01-20') as n",
      [tenancyId],
    );
    expect(added.rows[0]!.n).toBe(0);
    await legacy.close();
  }, 120_000);
});
