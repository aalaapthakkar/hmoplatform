import { describe, expect, it } from "vitest";
import { balanceLabel, buildLedger, type LedgerCharge, type LedgerPayment } from "./ledger";

const RENT = 60000;
let clock = 0;
/** Entered in the order the test writes them. */
const enteredAt = () => `2026-01-01T00:00:${String(clock++).padStart(2, "0")}.000Z`;

function charge(
  id: string,
  dueDate: string,
  amount = RENT,
  extra: Partial<LedgerCharge> = {},
): LedgerCharge {
  return {
    id,
    due_date: dueDate,
    amount_pence: amount,
    description: `Rent from ${dueDate}`,
    kind: "rent",
    reverses_charge_id: null,
    created_at: enteredAt(),
    ...extra,
  };
}

function chargeReversal(id: string, of: LedgerCharge, date: string, reason: string): LedgerCharge {
  return charge(id, date, of.amount_pence, {
    description: reason,
    kind: of.kind,
    reverses_charge_id: of.id,
  });
}

function payment(
  id: string,
  paidOn: string,
  amount: number,
  extra: Partial<LedgerPayment> = {},
): LedgerPayment {
  return {
    id,
    paid_on: paidOn,
    amount_pence: amount,
    method: "bank_transfer",
    reference: null,
    note: null,
    reverses_payment_id: null,
    created_at: enteredAt(),
    ...extra,
  };
}

function paymentReversal(id: string, of: LedgerPayment, date: string, reason: string) {
  return payment(id, date, of.amount_pence, {
    method: of.method,
    reference: of.reference,
    note: reason,
    reverses_payment_id: of.id,
  });
}

/** Each standing charge as [id, paid, left, status]. */
const allocation = (ledger: ReturnType<typeof buildLedger>) =>
  ledger.charges.map((c) => [c.id, c.paidPence, c.leftPence, c.status]);

describe("partial payments", () => {
  it("leaves a charge part paid until it's late, then overdue", () => {
    const charges = [charge("oct", "2026-10-01")];
    const payments = [payment("p1", "2026-10-01", 20000)];

    const onTheDay = buildLedger(charges, payments, "2026-10-01");
    expect(allocation(onTheDay)).toEqual([["oct", 20000, 40000, "part_paid"]]);
    expect(onTheDay).toMatchObject({
      balancePence: 40000,
      arrearsPence: 0,
      notYetLatePence: 40000,
    });

    const nextDay = buildLedger(charges, payments, "2026-10-02");
    expect(allocation(nextDay)).toEqual([["oct", 20000, 40000, "overdue"]]);
    expect(nextDay).toMatchObject({ arrearsPence: 40000, notYetLatePence: 0 });
  });

  it("clears a charge with several part payments", () => {
    const ledger = buildLedger(
      [charge("oct", "2026-10-01")],
      [
        payment("p1", "2026-10-01", 20000),
        payment("p2", "2026-10-08", 20000),
        payment("p3", "2026-10-15", 20000),
      ],
      "2026-10-20",
    );
    expect(allocation(ledger)).toEqual([["oct", 60000, 0, "paid"]]);
    expect(
      ledger.lines.filter((line) => line.kind === "payment").map((l) => l.paidTowards),
    ).toEqual([
      [{ chargeId: "oct", description: "Rent from 2026-10-01", pence: 20000 }],
      [{ chargeId: "oct", description: "Rent from 2026-10-01", pence: 20000 }],
      [{ chargeId: "oct", description: "Rent from 2026-10-01", pence: 20000 }],
    ]);
    expect(ledger).toMatchObject({ balancePence: 0, balanceLabel: "Up to date", arrearsPence: 0 });
  });

  it("pays the oldest unpaid charge first, whatever the payment date", () => {
    const ledger = buildLedger(
      [charge("sep", "2026-09-01"), charge("oct", "2026-10-01"), charge("nov", "2026-11-01")],
      [payment("p1", "2026-11-03", 90000)],
      "2026-11-05",
    );
    expect(allocation(ledger)).toEqual([
      ["sep", 60000, 0, "paid"],
      ["oct", 30000, 30000, "overdue"],
      ["nov", 0, 60000, "overdue"],
    ]);
    expect(ledger.arrearsPence).toBe(90000);
    expect(ledger.lines.at(-1)!.paidTowards.map((towards) => towards.pence)).toEqual([
      60000, 30000,
    ]);
  });

  it("only counts late charges as arrears; the rest is owed but not late", () => {
    const ledger = buildLedger(
      [charge("oct", "2026-10-01"), charge("key", "2026-10-20", 1500, { kind: "other" })],
      [payment("p1", "2026-10-02", 30000)],
      "2026-10-15",
    );
    expect(ledger).toMatchObject({
      balancePence: 31500,
      arrearsPence: 30000,
      notYetLatePence: 1500,
    });
    expect(allocation(ledger)).toEqual([
      ["oct", 30000, 30000, "overdue"],
      ["key", 0, 1500, "due"],
    ]);
  });
});

describe("overpayments", () => {
  it("turns money beyond every charge into credit", () => {
    const ledger = buildLedger(
      [charge("oct", "2026-10-01")],
      [payment("p1", "2026-10-01", 65000)],
      "2026-10-10",
    );
    expect(ledger).toMatchObject({
      balancePence: -5000,
      balanceLabel: "£50.00 in credit",
      creditPence: 5000,
      arrearsPence: 0,
    });
    const line = ledger.lines.at(-1)!;
    expect(line.paidTowards).toEqual([
      { chargeId: "oct", description: "Rent from 2026-10-01", pence: 60000 },
    ]);
    expect(line.creditPence).toBe(5000);
  });

  it("uses credit up on the next charge when it comes", () => {
    const ledger = buildLedger(
      [charge("oct", "2026-10-01"), charge("nov", "2026-11-01")],
      [payment("p1", "2026-10-01", 65000), payment("p2", "2026-11-01", 55000)],
      "2026-11-02",
    );
    expect(allocation(ledger)).toEqual([
      ["oct", 60000, 0, "paid"],
      ["nov", 60000, 0, "paid"],
    ]);
    expect(ledger).toMatchObject({ balancePence: 0, creditPence: 0 });
    // The first payment's extra £50 went towards November.
    expect(ledger.lines.find((l) => l.id === "p1")!.paidTowards.map((t) => t.chargeId)).toEqual([
      "oct",
      "nov",
    ]);
  });

  it("pays a charge in advance when the money arrives before it's due", () => {
    const ledger = buildLedger(
      [charge("oct", "2026-10-01")],
      [payment("p1", "2026-09-28", 60000)],
      "2026-10-05",
    );
    expect(allocation(ledger)).toEqual([["oct", 60000, 0, "paid"]]);
    // On the statement the payment comes first, in credit until the charge.
    expect(ledger.lines.map((line) => [line.id, line.balancePence])).toEqual([
      ["p1", -60000],
      ["oct", 0],
    ]);
  });
});

describe("reversals", () => {
  it("reversing a payment puts back what it had paid off, newest charges first", () => {
    const sep = charge("sep", "2026-09-01");
    const oct = charge("oct", "2026-10-01");
    const p1 = payment("p1", "2026-09-01", 60000);
    const p2 = payment("p2", "2026-10-01", 90000, { reference: "BIG" });
    const bounced = paymentReversal("r1", p2, "2026-10-04", "Bounced");

    const before = buildLedger([sep, oct], [p1, p2], "2026-10-05");
    expect(before.creditPence).toBe(30000);

    const after = buildLedger([sep, oct], [p1, p2, bounced], "2026-10-05");
    expect(allocation(after)).toEqual([
      ["sep", 60000, 0, "paid"],
      ["oct", 0, 60000, "overdue"],
    ]);
    expect(after).toMatchObject({ balancePence: 60000, creditPence: 0, arrearsPence: 60000 });

    const original = after.lines.find((line) => line.id === "p2")!;
    expect(original.reversed).toEqual({ dateLabel: "04/10/2026", reason: "Bounced" });
    expect(original.paidTowards).toEqual([]);
    const reversal = after.lines.find((line) => line.id === "r1")!;
    expect(reversal).toMatchObject({
      kind: "payment_reversal",
      description: "Reversal: payment of 01/10/2026",
      reason: "Bounced",
      adds: true,
      amountPence: 90000,
    });
  });

  it("reversing a payment that paid two charges makes both owed again", () => {
    const sep = charge("sep", "2026-09-01");
    const oct = charge("oct", "2026-10-01");
    const p1 = payment("p1", "2026-10-02", 120000);
    const ledger = buildLedger(
      [sep, oct],
      [p1, paymentReversal("r1", p1, "2026-10-03", "Entered against the wrong tenant")],
      "2026-10-03",
    );
    expect(allocation(ledger)).toEqual([
      ["sep", 0, 60000, "overdue"],
      ["oct", 0, 60000, "overdue"],
    ]);
  });

  it("reversing a charge passes its money on to the next charge", () => {
    const sep = charge("sep", "2026-09-01");
    const oct = charge("oct", "2026-10-01");
    const p1 = payment("p1", "2026-09-01", 60000);
    const ledger = buildLedger(
      [sep, oct, chargeReversal("r1", sep, "2026-09-10", "Rent-free month agreed")],
      [p1],
      "2026-10-02",
    );
    // September is gone, so the payment now covers October.
    expect(allocation(ledger)).toEqual([["oct", 60000, 0, "paid"]]);
    expect(ledger.balancePence).toBe(0);

    const reversal = ledger.lines.find((line) => line.id === "r1")!;
    expect(reversal).toMatchObject({
      kind: "charge_reversal",
      description: "Reversal: Rent from 2026-09-01",
      reason: "Rent-free month agreed",
      adds: false,
    });
    expect(ledger.lines.find((line) => line.id === "sep")!.reversed).toEqual({
      dateLabel: "10/09/2026",
      reason: "Rent-free month agreed",
    });
  });

  it("keeps every row on the statement, with the running balance putting each reversal right", () => {
    const oct = charge("oct", "2026-10-01");
    const wrong = charge("key", "2026-10-02", 2500, { kind: "other", description: "Key" });
    const ledger = buildLedger(
      [oct, wrong, chargeReversal("r1", wrong, "2026-10-03", "Charged by mistake")],
      [payment("p1", "2026-10-04", 60000)],
      "2026-10-05",
    );
    expect(ledger.lines.map((line) => [line.id, line.balancePence])).toEqual([
      ["oct", 60000],
      ["key", 62500],
      ["r1", 60000],
      ["p1", 0],
    ]);
    expect(ledger.charges.map((c) => c.id)).toEqual(["oct"]);
  });

  it("refuses to count a reversal of a reversal as anything", () => {
    // The database refuses these; if one ever appears, the statement still
    // only reverses the original once.
    const oct = charge("oct", "2026-10-01");
    const r1 = chargeReversal("r1", oct, "2026-10-02", "Mistake");
    const ledger = buildLedger([oct, r1], [], "2026-10-03");
    expect(ledger.charges).toEqual([]);
    expect(ledger.balancePence).toBe(0);
  });
});

describe("ordering and dates", () => {
  it("puts charges before payments on the same day", () => {
    const ledger = buildLedger(
      [charge("oct", "2026-10-01")],
      [payment("p1", "2026-10-01", 60000)],
      "2026-10-01",
    );
    expect(ledger.lines.map((line) => line.id)).toEqual(["oct", "p1"]);
    expect(ledger.lines.map((line) => line.balancePence)).toEqual([60000, 0]);
  });

  it("orders same-day entries by when they were entered", () => {
    const first = payment("b-first", "2026-10-01", 1000);
    const second = payment("a-second", "2026-10-01", 2000);
    const ledger = buildLedger([charge("oct", "2026-10-01", 2500)], [first, second], "2026-10-01");
    expect(ledger.lines.map((line) => line.id)).toEqual(["oct", "b-first", "a-second"]);
    expect(ledger.lines.find((l) => l.id === "a-second")!.paidTowards[0]!.pence).toBe(1500);
    expect(ledger.lines.find((l) => l.id === "a-second")!.creditPence).toBe(500);
  });

  it("is overdue from the day after the due date, not on it", () => {
    const charges = [charge("oct", "2026-10-31")];
    expect(buildLedger(charges, [], "2026-10-30").charges[0]!.status).toBe("due");
    expect(buildLedger(charges, [], "2026-10-31").charges[0]!.status).toBe("due");
    expect(buildLedger(charges, [], "2026-11-01").charges[0]!.status).toBe("overdue");
  });

  it("works the same for weekly rent mixed with one-off charges", () => {
    const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"].map((date, index) =>
      charge(`w${index + 1}`, date, 15000),
    );
    const ledger = buildLedger(
      [...weeks, charge("fob", "2026-10-13", 2000, { kind: "other", description: "Lost fob" })],
      [payment("p1", "2026-10-06", 15000), payment("p2", "2026-10-14", 16000)],
      "2026-10-20",
    );
    expect(allocation(ledger)).toEqual([
      ["w1", 15000, 0, "paid"],
      ["w2", 15000, 0, "paid"],
      ["fob", 1000, 1000, "overdue"],
      ["w3", 0, 15000, "overdue"],
    ]);
    expect(ledger).toMatchObject({ balancePence: 16000, arrearsPence: 16000 });
  });

  it("only ever deals in whole pence", () => {
    const ledger = buildLedger(
      [charge("part", "2026-10-15", 33534), charge("nov", "2026-11-01")],
      [payment("p1", "2026-10-15", 33535)],
      "2026-11-01",
    );
    expect(allocation(ledger)).toEqual([
      ["part", 33534, 0, "paid"],
      ["nov", 1, 59999, "part_paid"],
    ]);
    for (const line of ledger.lines) expect(Number.isInteger(line.balancePence)).toBe(true);
  });
});

describe("balanceLabel", () => {
  it("describes the balance", () => {
    expect(balanceLabel(12345)).toBe("£123.45 owed");
    expect(balanceLabel(-1500)).toBe("£15.00 in credit");
    expect(balanceLabel(0)).toBe("Up to date");
  });
});
