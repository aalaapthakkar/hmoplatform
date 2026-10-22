import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPence } from "@/lib/format";
import {
  CHARGE_STATUS_LABELS,
  type ChargeResult,
  type Ledger,
  type StatementLine,
} from "@/lib/rent/ledger";
import { cn } from "@/lib/utils";

const STATUS_BADGES: Record<ChargeResult["status"], string> = {
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  part_paid: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  overdue: "bg-destructive text-white",
  due: "bg-muted text-foreground",
};

/** A charge's status, with what's left when it isn't paid. */
export function ChargeStatusBadge({ charge }: { charge: ChargeResult }) {
  return (
    <Badge className={STATUS_BADGES[charge.status]} data-testid="charge-status">
      {CHARGE_STATUS_LABELS[charge.status]}
      {charge.status === "paid" ? "" : ` · ${formatPence(charge.leftPence)} left`}
    </Badge>
  );
}

/** Balance, arrears and credit: the same for staff and the tenant. */
export function StatementSummary({ ledger, footnote }: { ledger: Ledger; footnote?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Balance</span>
          <span
            className={cn("text-2xl font-semibold", ledger.arrearsPence > 0 && "text-destructive")}
            data-testid="statement-balance"
          >
            {ledger.balanceLabel}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Overdue</dt>
            <dd className="font-medium" data-testid="statement-arrears">
              {formatPence(ledger.arrearsPence)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {ledger.creditPence > 0 ? "In credit" : "Due, not late yet"}
            </dt>
            <dd className="font-medium">
              {formatPence(ledger.creditPence > 0 ? ledger.creditPence : ledger.notYetLatePence)}
            </dd>
          </div>
        </dl>
        {footnote ? <p className="text-xs text-muted-foreground">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * The statement as a list that reads well on a phone, newest first. Every
 * ledger row is shown: reversed entries are crossed out, and the reversal
 * that cancels them appears on its own date with the reason.
 */
export function StatementList({
  lines,
  action,
}: {
  lines: StatementLine[];
  /** Something to show on entries that stand, such as a Reverse button for staff. */
  action?: (line: StatementLine) => ReactNode;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing on the statement yet.</p>;
  }
  return (
    <ol className="flex flex-col divide-y rounded-xl border bg-background" aria-label="Statement">
      {[...lines].reverse().map((line) => {
        const reversal = line.kind === "charge_reversal" || line.kind === "payment_reversal";
        const isPayment = line.kind === "payment";
        return (
          <li
            key={line.id}
            className={cn(
              "flex flex-col gap-1.5 p-3 text-sm",
              line.reversed && "text-muted-foreground",
            )}
            data-testid="statement-line"
            data-kind={line.kind}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className={cn("font-medium break-words", line.reversed && "line-through")}>
                  {isPayment ? "Payment received" : line.description}
                </span>
                <span className="text-xs text-muted-foreground">
                  {line.dateLabel}
                  {isPayment && line.description ? ` · ${line.description}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className={cn("font-medium tabular-nums", line.reversed && "line-through")}>
                  {line.adds ? "" : "−"}
                  {formatPence(line.amountPence)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Balance{" "}
                  {line.balancePence < 0
                    ? `${formatPence(-line.balancePence)} credit`
                    : formatPence(line.balancePence)}
                </span>
              </div>
            </div>

            {line.charge ? (
              <div>
                <ChargeStatusBadge charge={line.charge} />
              </div>
            ) : null}
            {isPayment && !line.reversed && line.paidTowards.length > 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="paid-towards">
                Paid towards{" "}
                {line.paidTowards
                  .map((towards) => `${towards.description} (${formatPence(towards.pence)})`)
                  .join(", ")}
              </p>
            ) : null}
            {isPayment && !line.reversed && line.creditPence > 0 ? (
              <p className="text-xs text-muted-foreground">
                {formatPence(line.creditPence)} kept as credit for the next charge
              </p>
            ) : null}
            {line.reversed ? (
              <p className="text-xs">
                Reversed on {line.reversed.dateLabel}: {line.reversed.reason}
              </p>
            ) : null}
            {reversal && line.reason ? <p className="text-xs">Reason: {line.reason}</p> : null}
            {action && !reversal && !line.reversed ? <div>{action(line)}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}
