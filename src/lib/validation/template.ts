import { z } from "zod";
import { type TemplateKind, unknownFields } from "@/lib/documents/merge";

export type TemplateFormValues = { name: string; body: string; isDraft: string };

/** A template edit. Unknown {{fields}} are refused so nothing prints as "[not set]" by mistake. */
export function templateSchema(kind: TemplateKind) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Give the template a name")
        .max(100, "Use 100 characters or fewer"),
      body: z
        .string()
        .trim()
        .min(1, "The template needs some wording")
        .max(50_000, "Keep the template under 50,000 characters"),
      isDraft: z.enum(["yes", "no"]),
    })
    .superRefine((template, ctx) => {
      const unknown = unknownFields(template.body, kind);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["body"],
          message: `These fields don't exist for this document: ${unknown.map((field) => `{{${field}}}`).join(", ")}`,
        });
      }
    })
    .transform((template) => ({ ...template, isDraft: template.isDraft === "yes" }));
}
