"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addCharge,
  type ChargeFormValues,
  reverseEntry,
} from "@/app/(app)/tenancies/[tenancyId]/rent-actions";
import { Field, FormIdPrefix, PoundsInput, useFormValues } from "@/components/forms/fields";
import { StatementList } from "@/components/rent/statement-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPence } from "@/lib/format";
import { LogRentButton } from "@/components/rent/log-rent";
import type { StatementLine } from "@/lib/rent/ledger";

type Run = (action: () => Promise<{ status: string; message: string }>, after?: () => void) => void;

function useRun(): [Run, boolean] {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run: Run = (action, after) =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      after?.();
      router.refresh();
    });
  return [run, pending];
}

export function StaffStatementTools({
  tenancyId,
  today,
  lines,
}: {
  tenancyId: string;
  today: string;
  lines: StatementLine[];
}) {
  const [run, pending] = useRun();
  const [reversing, setReversing] = useState<StatementLine | null>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h2 className="font-semibold">Log a payment</h2>
            <p className="text-sm text-muted-foreground">
              Record money received. It pays off the oldest charges first, and anything over is kept
              as credit.
            </p>
            <div>
              <LogRentButton tenancyId={tenancyId} label="Log rent for this tenancy" />
            </div>
          </CardContent>
        </Card>
        <ChargeForm tenancyId={tenancyId} today={today} run={run} pending={pending} />
      </div>

      <section aria-labelledby="statement-heading" className="flex flex-col gap-2">
        <h2 id="statement-heading" className="text-lg font-semibold">
          Statement
        </h2>
        <StatementList
          lines={lines}
          action={(line) => (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setReason("");
                setReversing(line);
              }}
              aria-label={`Reverse ${line.kind} of ${formatPence(line.amountPence)} on ${line.dateLabel}`}
            >
              Reverse
            </Button>
          )}
        />
      </section>

      <AlertDialog
        open={reversing !== null}
        onOpenChange={(open) => (open ? null : setReversing(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reversing?.kind === "charge" ? "Reverse this charge?" : "Reverse this payment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Nothing is deleted: a reversal for the same amount is added today, and this entry is
              crossed out. The tenant sees your reason in their portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reverse-reason">Reason</Label>
            <Input
              id="reverse-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending || !reason.trim()}
              onClick={() =>
                reversing &&
                run(
                  () =>
                    reverseEntry({
                      kind: reversing.kind === "charge" ? "charge" : "payment",
                      entryId: reversing.id,
                      reason,
                    }),
                  () => setReversing(null),
                )
              }
            >
              {reversing?.kind === "charge" ? "Reverse charge" : "Reverse payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChargeForm({
  tenancyId,
  today,
  run,
  pending,
}: {
  tenancyId: string;
  today: string;
  run: Run;
  pending: boolean;
}) {
  const initial: ChargeFormValues = { dueDate: today, amount: "", description: "" };
  const form = useFormValues(initial);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => addCharge(tenancyId, form.values),
      () => form.setValues(initial),
    );
  }

  return (
    <Card>
      <CardContent>
        <FormIdPrefix value={form.prefix}>
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-3"
            aria-label="Add a charge"
          >
            <h2 className="font-semibold">Add a charge</h2>
            <p className="text-xs text-muted-foreground">
              Rent is charged automatically. Use this for one-off costs the tenancy allows.
            </p>
            <Field name="description" label="What it's for">
              <Input {...form.field("description")} autoComplete="off" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field name="dueDate" label="Due on">
                <Input {...form.field("dueDate")} type="date" />
              </Field>
              <Field name="amount" label="Amount">
                <PoundsInput {...form.field("amount")} />
              </Field>
            </div>
            <div>
              <Button type="submit" variant="outline" disabled={pending}>
                Add charge
              </Button>
            </div>
          </form>
        </FormIdPrefix>
      </CardContent>
    </Card>
  );
}
