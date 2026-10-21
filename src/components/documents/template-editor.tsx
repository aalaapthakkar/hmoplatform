"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useTransition } from "react";
import { toast } from "sonner";
import { saveTemplate } from "@/app/(app)/settings/documents/[templateId]/actions";
import { Field, FormIdPrefix, useFormValues } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  exampleValues,
  fieldsFor,
  mergeTemplate,
  type TemplateKind,
  toBlocks,
  unknownFields,
} from "@/lib/documents/merge";
import { type TemplateFormValues, templateSchema } from "@/lib/validation/template";

export function TemplateEditor({
  templateId,
  kind,
  initial,
  canEdit,
}: {
  templateId: string;
  kind: TemplateKind;
  initial: TemplateFormValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const form = useFormValues(initial);
  const [pending, startTransition] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const unknown = unknownFields(form.values.body, kind);

  /** Puts {{field}} where the cursor is, and keeps the cursor after it. */
  function insertField(key: string) {
    const textarea = body.current;
    const token = `{{${key}}}`;
    const start = textarea?.selectionStart ?? form.values.body.length;
    const end = textarea?.selectionEnd ?? start;
    form.set("body", form.values.body.slice(0, start) + token + form.values.body.slice(end));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.validate(templateSchema(kind))) return;
    startTransition(async () => {
      const result = await saveTemplate(templateId, form.values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <FormIdPrefix value={form.prefix}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field name="name" label="Name" error={form.errors.name}>
            <Input {...form.field("name")} disabled={!canEdit} />
          </Field>

          <label
            htmlFor={`${form.prefix}isDraft`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-amber-500 has-checked:bg-amber-50 dark:has-checked:bg-amber-950/30"
          >
            <input
              id={`${form.prefix}isDraft`}
              type="checkbox"
              checked={form.values.isDraft === "yes"}
              disabled={!canEdit}
              onChange={(event) => form.set("isDraft", event.target.checked ? "yes" : "no")}
              className="mt-0.5 size-4 accent-amber-600"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Still a draft</span>
              <span className="text-muted-foreground">
                Every page is stamped &quot;DRAFT: not solicitor approved&quot;. Only untick this
                once a solicitor has approved the wording.
              </span>
            </span>
          </label>

          <Field
            name="body"
            label="Wording"
            hint="Start a line with # or ## for a heading, or - for a bullet point. Leave a blank line between paragraphs."
            error={
              form.errors.body ??
              (unknown.length
                ? [`Unknown fields: ${unknown.map((field) => `{{${field}}}`).join(", ")}`]
                : undefined)
            }
          >
            <Textarea
              {...form.field("body")}
              ref={body}
              rows={22}
              disabled={!canEdit}
              className="font-mono text-sm"
              spellCheck
            />
          </Field>

          {canEdit ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Insert a field</p>
              <div className="flex flex-wrap gap-1.5">
                {fieldsFor(kind).map((field) => (
                  <Button
                    key={field.key}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => insertField(field.key)}
                    title={`{{${field.key}}}`}
                  >
                    {field.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {canEdit ? (
            <div>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Saving…" : "Save template"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Only admins can change templates.</p>
          )}
        </form>
      </FormIdPrefix>

      <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
        <h2 id="preview-heading" className="text-sm font-medium">
          Preview with example details
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3 text-sm" data-testid="template-preview">
            {form.values.isDraft === "yes" ? (
              <p className="rounded bg-amber-100 px-2 py-1 text-center text-xs font-semibold tracking-wide text-amber-900 uppercase dark:bg-amber-900/40 dark:text-amber-100">
                Draft: not solicitor approved
              </p>
            ) : null}
            {toBlocks(mergeTemplate(form.values.body, exampleValues())).map((block, index) =>
              block.type === "heading" ? (
                block.level === 1 ? (
                  <h3 key={index} className="text-lg font-semibold">
                    {block.text}
                  </h3>
                ) : (
                  <h4 key={index} className="font-semibold">
                    {block.text}
                  </h4>
                )
              ) : block.type === "list" ? (
                <ul key={index} className="list-disc pl-5">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={index}>{block.text}</p>
              ),
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
