"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FormState, initialFormState } from "@/lib/forms";

export type AuthField = {
  name: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  hint?: string;
};

type AuthFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: AuthField[];
  submitLabel: string;
  pendingLabel: string;
};

/** A small form driven by a server action. On success it shows the message instead of the form. */
export function AuthForm({ action, fields, submitLabel, pendingLabel }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-lg bg-muted p-4 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      {fields.map((field) => {
        const errors = state.fieldErrors?.[field.name];
        const errorId = `${field.name}-error`;
        const hintId = `${field.name}-hint`;
        const describedBy = [errors ? errorId : null, field.hint ? hintId : null]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              defaultValue={field.type === "password" ? undefined : state.values?.[field.name]}
              aria-invalid={errors ? true : undefined}
              aria-describedby={describedBy || undefined}
              required
            />
            {field.hint ? (
              <p id={hintId} className="text-xs text-muted-foreground">
                {field.hint}
              </p>
            ) : null}
            {errors ? (
              <p id={errorId} className="text-xs text-destructive">
                {errors[0]}
              </p>
            ) : null}
          </div>
        );
      })}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
