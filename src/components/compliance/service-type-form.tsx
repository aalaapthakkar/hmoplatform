"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveServiceType, setServiceTypeArchived } from "@/app/(app)/settings/compliance/actions";
import { Field, FormIdPrefix, selectClass, useFormValues } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fieldKey, FIELD_KIND_LABELS, type ServiceField } from "@/lib/compliance/fields";
import {
  CERTIFICATE_DOCUMENT_TYPES,
  type ServiceTypeFormValues,
} from "@/lib/compliance/service-type";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/compliance/status";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/document";

/** An extra field as the editor holds it: options as one comma separated line. */
type DraftField = { key: string; label: string; kind: ServiceField["kind"]; options: string };

function toDraft(field: ServiceField): DraftField {
  return { ...field, options: (field.options ?? []).join(", ") };
}

/**
 * Adds or edits a compliance type. Keys for new extra fields come from their
 * labels; existing keys never change, so details already recorded still match.
 */
export function ServiceTypeForm({
  typeId,
  initial,
  initialFields,
  archived,
  canEdit,
}: {
  typeId: string | null;
  initial: ServiceTypeFormValues;
  initialFields: ServiceField[];
  archived: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const form = useFormValues(initial);
  const [fields, setFields] = useState<DraftField[]>(initialFields.map(toDraft));
  const [existingKeys] = useState(() => new Set(initialFields.map((field) => field.key)));
  const [pending, startTransition] = useTransition();

  function setField(index: number, change: Partial<DraftField>) {
    setFields((current) =>
      current.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field, ...change };
        // New fields take their key from the label; saved ones keep theirs.
        if (change.label !== undefined && !existingKeys.has(field.key)) {
          next.key = fieldKey(change.label || "field");
        }
        return next;
      }),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveServiceType(typeId, {
        ...form.values,
        fields: fields.map(({ key, label, kind, options }) => ({
          key,
          label,
          kind,
          ...(kind === "choice"
            ? {
                options: options
                  .split(",")
                  .map((option) => option.trim())
                  .filter(Boolean),
              }
            : {}),
        })),
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      if (typeId === null && result.id) router.push(`/settings/compliance/${result.id}`);
      router.refresh();
    });
  }

  function toggleArchived() {
    if (!typeId) return;
    startTransition(async () => {
      const result = await setServiceTypeArchived(typeId, !archived);
      if (result.status === "error") toast.error(result.message);
      else toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-6"
        aria-label="Compliance type"
      >
        <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <Field name="name" label="Name">
                <Input {...form.field("name")} autoComplete="off" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="category" label="Category">
                  <select {...form.field("category")} className={selectClass}>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  name="expiryLabel"
                  label="What the date is called"
                  hint={'For example "Expires", "Renewal date" or "Next test due".'}
                >
                  <Input {...form.field("expiryLabel")} autoComplete="off" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="validityMonths"
                  label="Lasts for (months)"
                  hint="Leave blank if there's no fixed cycle and the date is typed in each time."
                >
                  <Input
                    {...form.field("validityMonths")}
                    inputMode="numeric"
                    className="max-w-32"
                  />
                </Field>
                <Field
                  name="alertWindowDays"
                  label="Alert window (days)"
                  hint="How long before the date it shows as due soon and reminders go out."
                >
                  <Input
                    {...form.field("alertWindowDays")}
                    inputMode="numeric"
                    className="max-w-32"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="requiresDocument" label="Certificate">
                  <select {...form.field("requiresDocument")} className={selectClass}>
                    <option value="yes">Required: missing until uploaded</option>
                    <option value="no">Optional</option>
                  </select>
                </Field>
                <Field name="documentType" label="File certificates as">
                  <select {...form.field("documentType")} className={selectClass}>
                    {CERTIFICATE_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {DOCUMENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field name="autoCreateJob" label="When it comes due">
                <select {...form.field("autoCreateJob")} className={selectClass}>
                  <option value="yes">Open a maintenance job automatically</option>
                  <option value="no">Just show it as due soon</option>
                </select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div>
                <h2 className="font-semibold">Extra details</h2>
                <p className="text-sm text-muted-foreground">
                  Anything else to record each time, such as a licence number.
                </p>
              </div>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ol className="flex flex-col gap-3" aria-label="Extra details">
                  {fields.map((field, index) => (
                    <li
                      key={index}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_12rem_auto]"
                    >
                      <Input
                        aria-label={`Detail ${index + 1} label`}
                        value={field.label}
                        placeholder="Label, for example Licence number"
                        onChange={(event) => setField(index, { label: event.target.value })}
                      />
                      <select
                        aria-label={`Detail ${index + 1} kind`}
                        value={field.kind}
                        onChange={(event) =>
                          setField(index, { kind: event.target.value as ServiceField["kind"] })
                        }
                        className={selectClass}
                      >
                        {Object.entries(FIELD_KIND_LABELS).map(([kind, label]) => (
                          <option key={kind} value={kind}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${field.label || `detail ${index + 1}`}`}
                        onClick={() =>
                          setFields((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                      {field.kind === "choice" ? (
                        <Input
                          aria-label={`Detail ${index + 1} options`}
                          value={field.options}
                          placeholder="Options, separated by commas"
                          onChange={(event) => setField(index, { options: event.target.value })}
                          className="sm:col-span-3"
                        />
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFields((current) => [
                      ...current,
                      { key: `field_${current.length + 1}`, label: "", kind: "text", options: "" },
                    ])
                  }
                >
                  <Plus aria-hidden />
                  Add a detail
                </Button>
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg">
                {pending ? "Saving…" : typeId ? "Save changes" : "Add type"}
              </Button>
              {typeId ? (
                <Button type="button" variant="outline" size="lg" onClick={toggleArchived}>
                  {archived ? "Bring back" : "Archive"}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only admins can change compliance types.
            </p>
          )}
        </fieldset>
      </form>
    </FormIdPrefix>
  );
}
