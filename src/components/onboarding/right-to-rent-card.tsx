"use client";

import { BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordRightToRent } from "@/app/(app)/applicants/[onboardingId]/actions";
import { Choice, Choices, Field, FormIdPrefix, useFormValues } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatUkDate } from "@/lib/format";
import {
  followUpDate,
  RIGHT_TO_RENT_METHODS,
  RIGHT_TO_RENT_PERMISSIONS,
  type RightToRentFormValues,
  rightToRentSchema,
} from "@/lib/validation/right-to-rent";
import { isRealDate } from "@/lib/validation/dates";

type Check = {
  id: string;
  check_date: string;
  method: keyof typeof RIGHT_TO_RENT_METHODS;
  permission: keyof typeof RIGHT_TO_RENT_PERMISSIONS;
  expiry_date: string | null;
  notes: string | null;
};

type Reminder = { id: string; title: string; due_date: string };

export function RightToRentCard({
  onboardingId,
  tenantId,
  checks,
  reminders,
  closed,
  today,
}: {
  onboardingId: string;
  tenantId: string;
  checks: Check[];
  reminders: Reminder[];
  closed: boolean;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card data-testid="right-to-rent-card">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Right to rent</h2>
          {!open && !closed ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Record a check
            </Button>
          ) : null}
        </div>

        {checks.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {checks.map((check) => (
              <li key={check.id} className="rounded-lg bg-muted/50 p-3">
                <p className="font-medium">
                  {RIGHT_TO_RENT_PERMISSIONS[check.permission]}
                  {check.expiry_date ? `, until ${formatUkDate(check.expiry_date)}` : ""}
                </p>
                <p className="text-muted-foreground">
                  Checked {formatUkDate(check.check_date)} · {RIGHT_TO_RENT_METHODS[check.method]}
                </p>
                {check.notes ? <p className="mt-1">{check.notes}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {reminders.map((reminder) => (
          <p
            key={reminder.id}
            className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50"
          >
            <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
            {reminder.title}: reminder on {formatUkDate(reminder.due_date)}.
          </p>
        ))}

        {open ? (
          <RightToRentForm
            onboardingId={onboardingId}
            tenantId={tenantId}
            today={today}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function RightToRentForm({
  onboardingId,
  tenantId,
  today,
  onDone,
}: {
  onboardingId: string;
  tenantId: string;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useFormValues<RightToRentFormValues>({
    checkDate: today,
    method: "",
    permission: "",
    expiryDate: "",
    notes: "",
  });
  const [pending, startTransition] = useTransition();
  const timeLimited = form.values.permission === "time_limited";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.validate(rightToRentSchema)) return;
    startTransition(async () => {
      const result = await recordRightToRent(onboardingId, tenantId, form.values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onDone();
      router.refresh();
    });
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 border-t pt-4">
        <Field name="checkDate" label="Date of the check" error={form.errors.checkDate}>
          <Input {...form.field("checkDate")} type="date" className="max-w-48" />
        </Field>
        <Choices legend="How you checked" name="method" error={form.errors.method}>
          {Object.entries(RIGHT_TO_RENT_METHODS).map(([value, label]) => (
            <Choice
              key={value}
              name="method"
              value={value}
              checked={form.values.method === value}
              onChange={() => form.set("method", value)}
              title={label}
            />
          ))}
        </Choices>
        <Choices legend="Result" name="permission" error={form.errors.permission}>
          {Object.entries(RIGHT_TO_RENT_PERMISSIONS).map(([value, label]) => (
            <Choice
              key={value}
              name="permission"
              value={value}
              checked={form.values.permission === value}
              onChange={() => form.set("permission", value)}
              title={label}
            />
          ))}
        </Choices>
        {timeLimited ? (
          <Field
            name="expiryDate"
            label="Permission ends on"
            hint={
              isRealDate(form.values.expiryDate)
                ? `We'll remind you to do a follow-up check on ${formatUkDate(followUpDate(form.values.expiryDate))}.`
                : "We'll remind you four weeks before, for the follow-up check."
            }
            error={form.errors.expiryDate}
          >
            <Input {...form.field("expiryDate")} type="date" className="max-w-48" />
          </Field>
        ) : null}
        <Field name="notes" label="Notes (optional)" error={form.errors.notes}>
          <Textarea {...form.field("notes")} rows={3} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Record check"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </FormIdPrefix>
  );
}
