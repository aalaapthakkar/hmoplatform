import { formatPence, formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type LedgerCharge = Pick<
  Tables["rent_charges"]["Row"],
  "id" | "due_date" | "amount_pence" | "description" | "kind" | "reverses_charge_id" | "created_at"
>;
export type LedgerPayment = Pick<
  Tables["rent_payments"]["Row"],
  | "id"
  | "paid_on"
  | "amount_pence"
  | "method"
  | "reference"
  | "note"
  | "reverses_payment_id"
  | "created_at"
>;

/** The columns buildLedger needs, for selects. */
export const CHARGE_COLUMNS =
  "id, due_date, amount_pence, description, kind, reverses_charge_id, created_at";
export const PAYMENT_COLUMNS =
  "id, paid_on, amount_pence, method, reference, note, reverses_payment_id, created_at";

export const PAYMENT_METHOD_LABELS: Record<LedgerPayment["method"], string> = {
  bank_transfer: "Bank transfer",
  standing_order: "Standing order",
  card: "Card",
  cash: "Cash",
  other: "Other",
};

/**
 * Paid: nothing left. Overdue: something left after the due date (even if
 * part paid). Part paid: some paid, not late yet. Due: nothing paid, not late yet.
 */
export type ChargeStatus = "paid" | "overdue" | "part_paid" | "due";

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  paid: "Paid",
  overdue: "Overdue",
  part_paid: "Part paid",
  due: "Due",
};

/** A charge that stands (not a reversal, not reversed), with what's been paid off it. */
export type ChargeResult = {
  id: string;
  dueDate: string;
  description: string;
  kind: LedgerCharge["kind"];
  amountPence: number;
  paidPence: number;
  leftPence: number;
  status: ChargeStatus;
};

export type LineKind = "charge" | "charge_reversal" | "payment" | "payment_reversal";

export type StatementLine = {
  id: string;
  kind: LineKind;
  /** YYYY-MM-DD, and as DD/MM/YYYY. */
  date: string;
  dateLabel: string;
  description: string;
  /** Always positive. Charges and payment reversals add to what's owed; the others take away. */
  amountPence: number;
  adds: boolean;
  /** What's owed after this line; negative means in credit. */
  balancePence: number;
  /** On a reversal: why. */
  reason: string | null;
  /** On an entry that was later reversed: when and why. */
  reversed: { dateLabel: string; reason: string } | null;
  /** On a standing charge. */
  charge: ChargeResult | null;
  /** On a standing payment: the charges it paid off, oldest first. */
  paidTowards: { chargeId: string; description: string; pence: number }[];
  /** On a standing payment: what was left over as credit. */
  creditPence: number;
};

export type Ledger = {
  /** Oldest first. */
  lines: StatementLine[];
  /** Standing charges, oldest first, with what's been paid off each. */
  charges: ChargeResult[];
  /** Everything charged minus everything paid. Negative means in credit. */
  balancePence: number;
  balanceLabel: string;
  /** Money paid beyond every charge so far. */
  creditPence: number;
  /** What's left on overdue charges. */
  arrearsPence: number;
  /** What's left on charges that aren't late yet. */
  notYetLatePence: number;
};

/** "£120.00 owed", "£15.00 in credit" or "Up to date". */
export function balanceLabel(pence: number) {
  if (pence > 0) return `${formatPence(pence)} owed`;
  if (pence < 0) return `${formatPence(-pence)} in credit`;
  return "Up to date";
}

function paymentDescription(payment: LedgerPayment) {
  return [PAYMENT_METHOD_LABELS[payment.method], payment.reference].filter(Boolean).join(" · ");
}

/** Oldest first; same day by when it was entered, then id, so the order never changes. */
function byDate<T extends { date: string; created_at: string; id: string }>(a: T, b: T) {
  return (
    a.date.localeCompare(b.date) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Works out a tenancy's statement from its ledger rows. Nothing here is
 * stored: allocation is calculated every time, so a reversal re-flows
 * everything after it.
 *
 * Payments (oldest first) pay off the oldest unpaid charges first. Money
 * beyond every charge is credit, and goes to the next charges as they come.
 * A reversed charge or payment drops out of the allocation completely.
 * A charge is overdue from the day after its due date while anything is left.
 */
export function buildLedger(
  charges: LedgerCharge[],
  payments: LedgerPayment[],
  today: string,
): Ledger {
  const chargeById = new Map(charges.map((charge) => [charge.id, charge]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const chargeReversals = new Map(
    charges.filter((c) => c.reverses_charge_id).map((c) => [c.reverses_charge_id!, c]),
  );
  const paymentReversals = new Map(
    payments.filter((p) => p.reverses_payment_id).map((p) => [p.reverses_payment_id!, p]),
  );

  // --- Allocation: standing payments to standing charges, oldest first.
  const standingCharges = charges
    .filter((charge) => !charge.reverses_charge_id && !chargeReversals.has(charge.id))
    .map((charge) => ({ ...charge, date: charge.due_date }))
    .sort(byDate);
  const standingPayments = payments
    .filter((payment) => !payment.reverses_payment_id && !paymentReversals.has(payment.id))
    .map((payment) => ({ ...payment, date: payment.paid_on }))
    .sort(byDate);

  const left = standingCharges.map((charge) => charge.amount_pence);
  const paidTowards = new Map<string, StatementLine["paidTowards"]>();
  const creditFrom = new Map<string, number>();
  let next = 0;
  for (const payment of standingPayments) {
    let money = payment.amount_pence;
    const towards: StatementLine["paidTowards"] = [];
    while (money > 0 && next < standingCharges.length) {
      const pence = Math.min(money, left[next]!);
      if (pence > 0) {
        towards.push({
          chargeId: standingCharges[next]!.id,
          description: standingCharges[next]!.description,
          pence,
        });
        left[next]! -= pence;
        money -= pence;
      }
      if (left[next] === 0) next += 1;
    }
    paidTowards.set(payment.id, towards);
    creditFrom.set(payment.id, money);
  }

  const results: ChargeResult[] = standingCharges.map((charge, index) => {
    const leftPence = left[index]!;
    const paidPence = charge.amount_pence - leftPence;
    const status: ChargeStatus =
      leftPence === 0
        ? "paid"
        : charge.due_date < today
          ? "overdue"
          : paidPence > 0
            ? "part_paid"
            : "due";
    return {
      id: charge.id,
      dueDate: charge.due_date,
      description: charge.description,
      kind: charge.kind,
      amountPence: charge.amount_pence,
      paidPence,
      leftPence,
      status,
    };
  });
  const resultById = new Map(results.map((result) => [result.id, result]));

  // --- Statement lines: every row, in date order, with a running balance.
  const rows = [
    ...charges.map((charge) => ({
      id: charge.id,
      created_at: charge.created_at,
      date: charge.due_date,
      kind: (charge.reverses_charge_id ? "charge_reversal" : "charge") as LineKind,
      charge,
      payment: null,
    })),
    ...payments.map((payment) => ({
      id: payment.id,
      created_at: payment.created_at,
      date: payment.paid_on,
      kind: (payment.reverses_payment_id ? "payment_reversal" : "payment") as LineKind,
      charge: null,
      payment,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      // Charges before payments on the same day, so a payment on the due date clears it.
      Number(a.payment !== null) - Number(b.payment !== null) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );

  let running = 0;
  const lines = rows.map((row): StatementLine => {
    const adds = row.kind === "charge" || row.kind === "payment_reversal";
    const amountPence = (row.charge ?? row.payment)!.amount_pence;
    running += adds ? amountPence : -amountPence;
    const base = {
      id: row.id,
      kind: row.kind,
      date: row.date,
      dateLabel: formatUkDate(row.date),
      amountPence,
      adds,
      balancePence: running,
      charge: null,
      paidTowards: [],
      creditPence: 0,
    };

    if (row.charge) {
      const charge = row.charge;
      if (charge.reverses_charge_id) {
        const original = chargeById.get(charge.reverses_charge_id);
        return {
          ...base,
          description: `Reversal: ${original?.description ?? "charge"}`,
          reason: charge.description,
          reversed: null,
        };
      }
      const reversal = chargeReversals.get(charge.id);
      return {
        ...base,
        description: charge.description,
        reason: null,
        reversed: reversal
          ? { dateLabel: formatUkDate(reversal.due_date), reason: reversal.description }
          : null,
        charge: resultById.get(charge.id) ?? null,
      };
    }

    const payment = row.payment!;
    if (payment.reverses_payment_id) {
      const original = paymentById.get(payment.reverses_payment_id);
      return {
        ...base,
        description: `Reversal: payment${original ? ` of ${formatUkDate(original.paid_on)}` : ""}`,
        reason: payment.note,
        reversed: null,
      };
    }
    const reversal = paymentReversals.get(payment.id);
    return {
      ...base,
      description: paymentDescription(payment),
      reason: null,
      reversed: reversal
        ? { dateLabel: formatUkDate(reversal.paid_on), reason: reversal.note ?? "" }
        : null,
      paidTowards: paidTowards.get(payment.id) ?? [],
      creditPence: creditFrom.get(payment.id) ?? 0,
    };
  });

  const arrearsPence = results
    .filter((result) => result.status === "overdue")
    .reduce((sum, result) => sum + result.leftPence, 0);
  const notYetLatePence = results
    .filter((result) => result.status === "due" || result.status === "part_paid")
    .reduce((sum, result) => sum + result.leftPence, 0);

  return {
    lines,
    charges: results,
    balancePence: running,
    balanceLabel: balanceLabel(running),
    creditPence: Math.max(0, -running),
    arrearsPence,
    notYetLatePence,
  };
}

/**
 * How a payment was allocated, in one sentence: "£550.00 logged: clears Rent
 * 01/10/2026 to 31/10/2026." Partly paid charges say what's still to pay, and
 * anything over is credit.
 */
export function describePayment(ledger: Ledger, paymentId: string): string {
  const line = ledger.lines.find((entry) => entry.id === paymentId);
  if (!line) return "Payment logged.";
  const left = new Map(ledger.charges.map((charge) => [charge.id, charge.leftPence]));
  const cleared = line.paidTowards.filter((towards) => left.get(towards.chargeId) === 0);
  const partly = line.paidTowards.filter((towards) => (left.get(towards.chargeId) ?? 0) > 0);

  const parts: string[] = [];
  if (cleared.length > 0) {
    parts.push(`clears ${cleared.map((towards) => towards.description).join(" and ")}`);
  }
  for (const towards of partly) {
    parts.push(
      `${formatPence(towards.pence)} towards ${towards.description} (${formatPence(left.get(towards.chargeId)!)} still to pay)`,
    );
  }
  if (line.creditPence > 0) parts.push(`${formatPence(line.creditPence)} kept as credit`);
  return parts.length > 0
    ? `${formatPence(line.amountPence)} logged: ${parts.join("; ")}.`
    : `${formatPence(line.amountPence)} logged.`;
}
