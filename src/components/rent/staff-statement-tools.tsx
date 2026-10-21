"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addCharge,
  type ChargeFormValues,
  type PaymentFormValues,
  recordPayment,
  voidEntry,
} from "@/app/(app)/tenancies/[tenancyId]/rent-actions";
import {
  Field,
  FormIdPrefix,
  PoundsInput,
  selectClass,
  useFormValues,
} from "@/components/forms/fields";
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
import { PAYMENT_METHOD_LABELS, type StatementLine } from "@/lib/rent/statement";

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
  const [voiding, setVoiding] = useState<StatementLine | null>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <PaymentForm tenancyId={tenancyId} today={today} run={run} pending={pending} />
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
                setVoiding(line);
              }}
              aria-label={`${line.type === "charge" ? "Void" : "Reverse"} ${line.type} of ${formatPence(line.chargePence ?? line.paymentPence ?? 0)} on ${line.dateLabel}`}
            >
              {line.type === "charge" ? "Void" : "Reverse"}
            </Button>
          )}
        />
      </section>

      <AlertDialog
        open={voiding !== null}
        onOpenChange={(open) => (open ? null : setVoiding(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {voiding?.type === "charge" ? "Void this charge?" : "Reverse this payment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              It stays on the statement, crossed out, with your reason. It no longer counts towards
              the balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Input
              id="void-reason"
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
                voiding &&
                run(
                  () => voidEntry({ kind: voiding.type, entryId: voiding.id, reason }),
                  () => setVoiding(null),
                )
              }
            >
              {voiding?.type === "charge" ? "Void charge" : "Reverse payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PaymentForm({
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
  const initial: PaymentFormValues = {
    paidOn: today,
    amount: "",
    method: "bank_transfer",
    reference: "",
  };
  const form = useFormValues(initial);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => recordPayment(tenancyId, form.values),
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
            aria-label="Record a payment"
          >
            <h2 className="font-semibold">Record a payment</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field name="paidOn" label="Paid on">
                <Input {...form.field("paidOn")} type="date" max={today} />
              </Field>
              <Field name="amount" label="Amount">
                <PoundsInput {...form.field("amount")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="method" label="How">
                <select {...form.field("method")} className={selectClass}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="reference" label="Reference (optional)">
                <Input {...form.field("reference")} autoComplete="off" />
              </Field>
            </div>
            <div>
              <Button type="submit" disabled={pending}>
                Record payment
              </Button>
            </div>
          </form>
        </FormIdPrefix>
      </CardContent>
    </Card>
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
