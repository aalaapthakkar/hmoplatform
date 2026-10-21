"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { type StepFormValues, updateStep } from "@/app/(app)/applicants/[onboardingId]/actions";
import { Field, FormIdPrefix, selectClass, useFormValues } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatUkDate } from "@/lib/format";
import { isOverdue, STEP_STATUS_LABELS } from "@/lib/onboarding/steps";
import type { OnboardingStepRow } from "@/lib/onboarding/queries";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string };

const ownerValue = (step: OnboardingStepRow) =>
  step.owner_is_applicant ? "applicant" : (step.owner_user_id ?? "");

function formValues(step: OnboardingStepRow): StepFormValues {
  return {
    status: step.status,
    owner: ownerValue(step),
    dueDate: step.due_date ?? "",
    notes: step.notes ?? "",
  };
}

export function OnboardingSteps({
  steps,
  people,
  currentStepId,
  closed,
  today,
}: {
  steps: OnboardingStepRow[];
  people: Person[];
  currentStepId: string | null;
  closed: boolean;
  today: string;
}) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 768px)");
  const [editing, setEditing] = useState<OnboardingStepRow | null>(null);
  const [pending, startTransition] = useTransition();
  const ownerName = (step: OnboardingStepRow) =>
    step.owner_is_applicant
      ? "Applicant"
      : (people.find((person) => person.id === step.owner_user_id)?.name ?? "Nobody yet");

  function save(step: OnboardingStepRow, values: StepFormValues, after?: () => void) {
    startTransition(async () => {
      const result = await updateStep(step.id, values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      after?.();
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
      <h2 id="steps-heading" className="text-lg font-semibold">
        Steps
      </h2>
      <ol className="flex flex-col gap-2">
        {steps.map((step) => {
          const finished = step.status === "done" || step.status === "skipped";
          const overdue = isOverdue({ status: step.status, dueDate: step.due_date }, today);
          return (
            <li
              key={step.id}
              data-testid="onboarding-step"
              aria-current={step.id === currentStepId ? "step" : undefined}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
                step.id === currentStepId && "border-primary bg-primary/5",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  finished && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {step.status === "done" ? <Check className="size-4" /> : step.position}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{step.title}</span>
                  <Badge variant={finished ? "secondary" : "outline"}>
                    {STEP_STATUS_LABELS[step.status]}
                  </Badge>
                  {overdue ? <Badge className="bg-destructive text-white">Overdue</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ownerName(step)}
                  {step.due_date ? ` · due ${formatUkDate(step.due_date)}` : ""}
                  {step.completed_at && step.status === "done"
                    ? ` · done ${formatUkDate(step.completed_at)}`
                    : ""}
                </p>
                {step.notes ? <p className="text-sm whitespace-pre-line">{step.notes}</p> : null}
              </div>
              {closed ? null : (
                <div className="flex gap-2">
                  {finished ? null : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => save(step, { ...formValues(step), status: "done" })}
                      aria-label={`Mark ${step.title} done`}
                    >
                      Mark done
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(step)}
                    aria-label={`Edit ${step.title}`}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          className="max-h-[90svh] overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          {editing ? (
            <StepForm
              key={editing.id}
              step={editing}
              people={people}
              pending={pending}
              onSave={(values) => save(editing, values, () => setEditing(null))}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function StepForm({
  step,
  people,
  pending,
  onSave,
}: {
  step: OnboardingStepRow;
  people: Person[];
  pending: boolean;
  onSave: (values: StepFormValues) => void;
}) {
  const form = useFormValues(formValues(step));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(form.values);
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>{step.title}</SheetTitle>
          <SheetDescription>Step {step.position}</SheetDescription>
        </SheetHeader>
        <Field name="status" label="Status" error={form.errors.status}>
          <select {...form.field("status")} className={selectClass}>
            {Object.entries(STEP_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field name="owner" label="Who's doing it" error={form.errors.owner}>
          <select {...form.field("owner")} className={selectClass}>
            <option value="">Nobody yet</option>
            <option value="applicant">The applicant</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="dueDate" label="Due date (optional)" error={form.errors.dueDate}>
          <Input {...form.field("dueDate")} type="date" className="max-w-48" />
        </Field>
        <Field name="notes" label="Notes (optional)" error={form.errors.notes}>
          <Textarea {...form.field("notes")} rows={4} />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save step"}
        </Button>
      </form>
    </FormIdPrefix>
  );
}
