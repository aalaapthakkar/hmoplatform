import { formatPence, formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type ChargeRow = Pick<
  Tables["rent_charges"]["Row"],
  "id" | "due_date" | "amount_pence" | "description" | "status" | "void_reason" | "kind"
>;
export type PaymentRow = Pick<
  Tables["rent_payments"]["Row"],
  "id" | "paid_on" | "amount_pence" | "method" | "reference" | "status" | "void_reason"
>;

export const PAYMENT_METHOD_LABELS: Record<PaymentRow["method"], string> = {
  bank_transfer: "Bank transfer",
  standing_order: "Standing order",
  card: "Card",
  cash: "Cash",
  other: "Other",
};

export type StatementLine = {
  id: string;
  type: "charge" | "payment";
  date: string;
  dateLabel: string;
  description: string;
  /** Pence: charges add to what's owed, payments take it away. */
  chargePence: number | null;
  paymentPence: number | null;
  /** What's owed after this line (negative means in credit). Null for voided lines. */
  balancePence: number | null;
  voided: boolean;
  voidReason: string | null;
};

export type Statement = {
  lines: StatementLine[];
  /** Charges minus payments, from active entries only. Always calculated, never stored. */
  balancePence: number;
  balanceLabel: string;
};

/** "£120.00 owed", "£15.00 in credit" or "Up to date". */
export function balanceLabel(pence: number) {
  if (pence > 0) return `${formatPence(pence)} owed`;
  if (pence < 0) return `${formatPence(-pence)} in credit`;
  return "Up to date";
}

/**
 * A statement in date order (charges before payments on the same day) with
 * a running balance. Voided entries are listed but don't count.
 */
export function buildStatement(charges: ChargeRow[], payments: PaymentRow[]): Statement {
  const entries = [
    ...charges.map((charge) => ({
      id: charge.id,
      type: "charge" as const,
      date: charge.due_date,
      description: charge.description,
      amount: charge.amount_pence,
      voided: charge.status === "voided",
      voidReason: charge.void_reason,
    })),
    ...payments.map((payment) => ({
      id: payment.id,
      type: "payment" as const,
      date: payment.paid_on,
      description: [PAYMENT_METHOD_LABELS[payment.method], payment.reference]
        .filter(Boolean)
        .join(" · "),
      amount: payment.amount_pence,
      voided: payment.status === "voided",
      voidReason: payment.void_reason,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.type === b.type ? 0 : a.type === "charge" ? -1 : 1) ||
      a.id.localeCompare(b.id),
  );

  let running = 0;
  const lines = entries.map((entry): StatementLine => {
    if (!entry.voided) running += entry.type === "charge" ? entry.amount : -entry.amount;
    return {
      id: entry.id,
      type: entry.type,
      date: entry.date,
      dateLabel: formatUkDate(entry.date),
      description: entry.description,
      chargePence: entry.type === "charge" ? entry.amount : null,
      paymentPence: entry.type === "payment" ? entry.amount : null,
      balancePence: entry.voided ? null : running,
      voided: entry.voided,
      voidReason: entry.voidReason,
    };
  });

  return { lines, balancePence: running, balanceLabel: balanceLabel(running) };
}
