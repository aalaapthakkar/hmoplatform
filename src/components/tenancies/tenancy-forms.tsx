"use client";

import { AlertTriangle } from "lucide-react";
import { type FormEvent, useTransition } from "react";
import { toast } from "sonner";
import {
  changeMoveInDate,
  createTenancy,
  recordNotice,
} from "@/app/(app)/properties/[propertyId]/rooms/[roomId]/actions";
import {
  Choice,
  Choices,
  Field,
  FormIdPrefix,
  PoundsInput,
  selectClass,
  useFormValues,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatUkDate } from "@/lib/format";
import { canAddTenancy, dueDayLabel, type TenancyDates } from "@/lib/tenancies/status";
import type { TenancySummary } from "@/lib/tenancies/summary";
import { addMonths, isRealDate } from "@/lib/validation/dates";
import { poundsToPence } from "@/lib/validation/property";
import {
  depositCapLabel,
  END_REASON_LABELS,
  END_REASONS,
  type NoticeFormValues,
  noticeSchema,
  noticeWarning,
  type TenancyFormValues,
  tenancySchema,
} from "@/lib/validation/tenancy";

/** 1 = Monday ... 7 = Sunday, for a "YYYY-MM-DD" date. */
function weekdayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function defaultDueDay(frequency: string, startDate: string) {
  if (!isRealDate(startDate)) return "1";
  return String(frequency === "weekly" ? weekdayOf(startDate) : Number(startDate.slice(8)));
}

export function TenancyForm({
  roomId,
  roomRent,
  roomFrequency,
  existing,
  today,
  onDone,
}: {
  roomId: string;
  roomRent: string;
  roomFrequency: "monthly" | "weekly";
  existing: TenancyDates[];
  today: string;
  onDone: (message: string, tenancyId?: string) => void;
}) {
  const form = useFormValues<TenancyFormValues & { startOnboarding: string }>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    startDate: today,
    rent: roomRent,
    rentFrequency: roomFrequency,
    rentDueDay: defaultDueDay(roomFrequency, today),
    deposit: "",
    startOnboarding: "yes",
  });
  const [pending, startTransition] = useTransition();
  const { values } = form;
  const weekly = values.rentFrequency === "weekly";

  // Explain the one-current, one-upcoming rule before saving.
  const slot = isRealDate(values.startDate)
    ? canAddTenancy(existing, values.startDate, today)
    : null;
  const rentPence = poundsToPence(values.rent);
  const frequency = weekly ? "weekly" : "monthly";

  function changeFrequency(next: "monthly" | "weekly") {
    form.setValues((current) => ({
      ...current,
      rentFrequency: next,
      rentDueDay: defaultDueDay(next, current.startDate),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = form.validate(tenancySchema);
    if (!parsed) return;
    if (slot && !slot.ok) {
      form.setErrors({ startDate: [slot.message] });
      return;
    }
    startTransition(async () => {
      const result = await createTenancy(roomId, values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      onDone(result.message, result.id);
    });
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Add a tenancy</SheetTitle>
          <SheetDescription>
            A periodic tenancy with no fixed end date. It ends when notice is given.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-4">
          <Field name="firstName" label="First name" error={form.errors.firstName}>
            <Input {...form.field("firstName")} autoComplete="off" />
          </Field>
          <Field name="lastName" label="Last name" error={form.errors.lastName}>
            <Input {...form.field("lastName")} autoComplete="off" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="email" label="Email (optional)" error={form.errors.email}>
            <Input {...form.field("email")} type="email" autoComplete="off" />
          </Field>
          <Field name="phone" label="Phone (optional)" error={form.errors.phone}>
            <Input {...form.field("phone")} type="tel" autoComplete="off" />
          </Field>
        </div>

        <Field
          name="startDate"
          label="Start date"
          error={form.errors.startDate}
          hint={
            slot === null
              ? null
              : !slot.ok
                ? slot.message
                : slot.status === "prospective"
                  ? `This will be an upcoming tenancy, starting ${formatUkDate(values.startDate)}.`
                  : "This will be the room's current tenancy."
          }
        >
          <Input {...form.field("startDate")} type="date" className="max-w-48" />
        </Field>

        <Choices legend="Rent is paid" name="rentFrequency" error={form.errors.rentFrequency}>
          <Choice
            name="rentFrequency"
            value="monthly"
            checked={!weekly}
            onChange={() => changeFrequency("monthly")}
            title="Monthly"
          />
          <Choice
            name="rentFrequency"
            value="weekly"
            checked={weekly}
            onChange={() => changeFrequency("weekly")}
            title="Weekly"
          />
        </Choices>

        <div className="grid grid-cols-2 gap-4">
          <Field
            name="rent"
            label={weekly ? "Rent per week" : "Rent per month"}
            error={form.errors.rent}
          >
            <PoundsInput {...form.field("rent")} />
          </Field>
          <Field name="rentDueDay" label="Rent due" error={form.errors.rentDueDay}>
            <select {...form.field("rentDueDay")} className={selectClass}>
              {Array.from({ length: weekly ? 7 : 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {dueDayLabel(frequency, day)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          name="deposit"
          label="Deposit (optional)"
          hint={
            rentPence !== null && rentPence > 0
              ? `At most ${depositCapLabel(rentPence, frequency)}, by law.`
              : "At most 5 weeks' rent, by law."
          }
          error={form.errors.deposit}
        >
          <PoundsInput {...form.field("deposit")} />
        </Field>

        {slot?.ok && slot.status === "prospective" ? (
          <label
            htmlFor={`${form.prefix}startOnboarding`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
          >
            <input
              id={`${form.prefix}startOnboarding`}
              type="checkbox"
              checked={values.startOnboarding === "yes"}
              onChange={(event) => form.set("startOnboarding", event.target.checked ? "yes" : "no")}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Start onboarding</span>
              <span className="text-muted-foreground">
                Track the application, right to rent check, deposit and move-in.
              </span>
            </span>
          </label>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Add tenancy"}
        </Button>
      </form>
    </FormIdPrefix>
  );
}

export function NoticeForm({
  tenancy,
  today,
  onDone,
}: {
  tenancy: TenancySummary;
  today: string;
  onDone: (message: string) => void;
}) {
  const existingNotice = tenancy.status === "ending";
  const form = useFormValues<NoticeFormValues>({
    endReason: existingNotice ? "" : "tenant_notice",
    noticeDate: today,
    endDate: addMonths(today, 2),
  });
  const [pending, startTransition] = useTransition();
  const warning = noticeWarning(form.values);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.validate(noticeSchema)) return;
    startTransition(async () => {
      const result = await recordNotice(tenancy.id, form.values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      onDone(result.message);
    });
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>{existingNotice ? "Change the notice" : "Record notice"}</SheetTitle>
          <SheetDescription>
            {tenancy.tenantNames}, since {tenancy.start}. The tenancy stays current until its last
            day, then you confirm they&apos;ve left.
          </SheetDescription>
        </SheetHeader>

        <Choices legend="How is it ending?" name="endReason" error={form.errors.endReason}>
          {END_REASONS.map((reason) => (
            <Choice
              key={reason}
              name="endReason"
              value={reason}
              checked={form.values.endReason === reason}
              onChange={() => form.set("endReason", reason)}
              title={END_REASON_LABELS[reason]}
            />
          ))}
        </Choices>

        <div className="grid grid-cols-2 gap-4">
          <Field name="noticeDate" label="Notice given on" error={form.errors.noticeDate}>
            <Input {...form.field("noticeDate")} type="date" />
          </Field>
          <Field name="endDate" label="Last day" error={form.errors.endDate}>
            <Input {...form.field("endDate")} type="date" />
          </Field>
        </div>

        {warning ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {warning}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : existingNotice ? "Save notice" : "Record notice"}
        </Button>
      </form>
    </FormIdPrefix>
  );
}

export function MoveInDateForm({
  tenancy,
  today,
  onDone,
}: {
  tenancy: TenancySummary;
  today: string;
  onDone: (message: string) => void;
}) {
  const form = useFormValues({ startDate: tenancy.dates.startDate });
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isRealDate(form.values.startDate)) {
      form.setErrors({ startDate: ["Enter a real date, like 31/12/2026"] });
      return;
    }
    if (form.values.startDate < today) {
      form.setErrors({ startDate: ["Choose today or a later date"] });
      return;
    }
    startTransition(async () => {
      const result = await changeMoveInDate(tenancy.id, form.values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      onDone(result.message);
    });
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Change the move-in date</SheetTitle>
          <SheetDescription>
            {tenancy.tenantNames} is due to move in on {tenancy.start}.
          </SheetDescription>
        </SheetHeader>
        <Field name="startDate" label="New move-in date" error={form.errors.startDate}>
          <Input {...form.field("startDate")} type="date" className="max-w-48" />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Change date"}
        </Button>
      </form>
    </FormIdPrefix>
  );
}
