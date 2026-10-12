import { z } from "zod";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Non-sensitive values to put back into the form after a failed submit. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

type ParseResult<T> = { ok: true; data: T } | { ok: false; state: FormState };

/** Validates FormData with a Zod schema, returning field errors in FormState shape. */
export function parseFormData<T extends z.ZodType>(
  schema: T,
  formData: FormData,
  keepValues: string[] = [],
): ParseResult<z.infer<T>> {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    state: {
      status: "error",
      fieldErrors: z.flattenError(result.error).fieldErrors as Record<string, string[]>,
      values: pickStrings(raw, keepValues),
    },
  };
}

export function pickStrings(raw: Record<string, unknown>, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") values[key] = value;
  }
  return values;
}
