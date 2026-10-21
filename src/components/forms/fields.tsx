"use client";

import {
  type ChangeEvent,
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Shared form building blocks: labelled fields with hints and errors, £ inputs and choice cards. */

/**
 * Each form's element ids start with its own prefix. Next.js keeps recently
 * visited pages mounted (hidden), so two forms with the same field names can
 * be in the document at once; the prefix keeps labels and errors pointing at
 * the right inputs.
 */
const IdPrefix = createContext("");
export const FormIdPrefix = IdPrefix.Provider;

/** The element id for a field name in the current form. */
export function useFieldId(name: string) {
  return `${useContext(IdPrefix)}${name}`;
}

export const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

export function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string[];
  children: ReactNode;
}) {
  const id = useFieldId(name);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <div id={`${id}-hint`} className="text-xs text-muted-foreground empty:hidden">
        {hint}
      </div>
      {error?.[0] ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

export function PoundsInput(props: ComponentProps<typeof Input>) {
  return (
    <div className="flex max-w-40 items-center gap-1.5">
      <span aria-hidden className="text-muted-foreground">
        £
      </span>
      <Input {...props} inputMode="decimal" autoComplete="off" />
    </div>
  );
}

export function Choices({
  legend,
  name,
  error,
  children,
}: {
  legend: string;
  name: string;
  error?: string[];
  children: ReactNode;
}) {
  const id = useFieldId(name);
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error?.[0] ? `${id}-error` : undefined}
    >
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">{children}</div>
      {error?.[0] ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : null}
    </fieldset>
  );
}

export function Choice({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: string;
}) {
  const id = useFieldId(`${name}-${value}`);
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50",
        "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? <span className="text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

export type FieldErrors<T> = Partial<Record<keyof T, string[]>>;

/** What field(name) spreads onto an input, select or textarea. */
export type FieldProps = {
  id: string;
  name: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string;
};

/**
 * Form state for small forms whose values are all strings until validated.
 * field(name) gives an input its id, value, change handler and error wiring.
 */
export function useFormValues<T extends Record<string, string>>(initial: T) {
  const prefix = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<T>>({});

  function set(name: keyof T, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function field(name: keyof T & string): FieldProps {
    const error = errors[name]?.[0];
    const id = `${prefix}${name}`;
    return {
      id,
      name,
      value: values[name] as string,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        set(name, event.target.value),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": [error ? `${id}-error` : null, `${id}-hint`].join(" "),
    };
  }

  /** Checks the values, showing field errors. Returns the parsed data, or null. */
  function validate<S extends z.ZodType>(schema: S): z.infer<S> | null {
    const result = schema.safeParse(values);
    if (result.success) return result.data;
    setErrors(z.flattenError(result.error).fieldErrors as FieldErrors<T>);
    return null;
  }

  return { prefix, values, setValues, errors, setErrors, set, field, validate };
}
