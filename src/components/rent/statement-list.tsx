import type { ReactNode } from "react";
import { formatPence } from "@/lib/format";
import type { StatementLine } from "@/lib/rent/statement";
import { cn } from "@/lib/utils";

/**
 * A statement as a list that reads well on a phone: date, what it was, the
 * amount and the running balance. Voided lines are struck through.
 */
export function StatementList({
  lines,
  action,
}: {
  lines: StatementLine[];
  /** Something to show on each line, such as a Void button for staff. */
  action?: (line: StatementLine) => ReactNode;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing on the statement yet.</p>;
  }
  // Newest first, as people read statements on a phone.
  return (
    <ol className="flex flex-col divide-y rounded-xl border" aria-label="Statement">
      {[...lines].reverse().map((line) => (
        <li
          key={`${line.type}-${line.id}`}
          className={cn("flex flex-col gap-1 p-3 text-sm", line.voided && "text-muted-foreground")}
          data-testid="statement-line"
        >
          <div className="flex items-start justify-between gap-3">
            <div className={cn("flex min-w-0 flex-col", line.voided && "line-through")}>
              <span className="font-medium">
                {line.type === "charge" ? line.description : "Payment received"}
              </span>
              <span className="text-xs text-muted-foreground">
                {line.dateLabel}
                {line.type === "payment" && line.description ? ` · ${line.description}` : ""}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className={cn("font-medium tabular-nums", line.voided && "line-through")}>
                {line.chargePence !== null
                  ? formatPence(line.chargePence)
                  : `−${formatPence(line.paymentPence ?? 0)}`}
              </span>
              {line.balancePence !== null ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Balance{" "}
                  {line.balancePence < 0
                    ? `${formatPence(-line.balancePence)} credit`
                    : formatPence(line.balancePence)}
                </span>
              ) : null}
            </div>
          </div>
          {line.voided ? (
            <p className="text-xs">
              {line.type === "charge" ? "Voided" : "Reversed"}: {line.voidReason}
            </p>
          ) : action ? (
            <div>{action(line)}</div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
