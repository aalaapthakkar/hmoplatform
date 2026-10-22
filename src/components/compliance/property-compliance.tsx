"use client";

import { Download, FileWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type CheckFormValues,
  markNeeded,
  markNotNeeded,
  recordCheck,
} from "@/app/(app)/properties/[propertyId]/compliance/actions";
import { Field, FormIdPrefix, selectClass, useFormValues } from "@/components/forms/fields";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/hooks/use-media-query";
import { detailsToForm, formatDetail, type ServiceField } from "@/lib/compliance/fields";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  type ComplianceItem,
  daysLeftLabel,
  expiryFrom,
  RAG_CLASSES,
  ragOf,
} from "@/lib/compliance/status";
import { formatUkDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_FILES,
  documentPath,
  DOCUMENTS_BUCKET,
  fileContentType,
  fileProblem,
} from "@/lib/validation/document";

export type PropertyComplianceProps = {
  orgId: string;
  propertyId: string;
  today: string;
  items: ComplianceItem[];
  /** Each type's extra fields, by type id. */
  fieldsByType: Record<string, ServiceField[]>;
  /** Certificate file names, by document id. */
  documentNames: Record<string, string>;
};

export function StatusBadge({ status }: { status: ComplianceItem["status"] }) {
  return (
    <Badge className={RAG_CLASSES[ragOf(status)]} data-testid="compliance-status">
      {COMPLIANCE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Every compliance item for a property, grouped by category, worst first within each. */
export function PropertyCompliance({
  orgId,
  propertyId,
  today,
  items,
  fieldsByType,
  documentNames,
}: PropertyComplianceProps) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 768px)");
  const [recording, setRecording] = useState<ComplianceItem | null>(null);
  const [notNeeded, setNotNeeded] = useState<ComplianceItem | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ status: string; message: string }>, after?: () => void) {
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
  }

  return (
    <div className="flex flex-col gap-8">
      {CATEGORIES.filter((category) => items.some((item) => item.category === category)).map(
        (category) => (
          <section
            key={category}
            className="flex flex-col gap-3"
            aria-labelledby={`cat-${category}`}
          >
            <h3 id={`cat-${category}`} className="font-semibold">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {items
                .filter((item) => item.category === category)
                .map((item) => (
                  <ItemCard
                    key={item.service_type_id}
                    item={item}
                    propertyId={propertyId}
                    fields={fieldsByType[item.service_type_id] ?? []}
                    documentName={item.document_id ? documentNames[item.document_id] : undefined}
                    pending={pending}
                    onRecord={() => setRecording(item)}
                    onNotNeeded={() => {
                      setReason("");
                      setNotNeeded(item);
                    }}
                    onNeeded={() => run(() => markNeeded(propertyId, item.service_type_id))}
                  />
                ))}
            </div>
          </section>
        ),
      )}

      <Sheet open={recording !== null} onOpenChange={(open) => (open ? null : setRecording(null))}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          className="max-h-[90svh] overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          {recording ? (
            <>
              <SheetHeader>
                <SheetTitle>{recording.service_name}</SheetTitle>
                <SheetDescription>
                  Record the latest check or certificate. The old one stays in the history.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <RecordCheckForm
                  key={recording.service_type_id}
                  orgId={orgId}
                  propertyId={propertyId}
                  today={today}
                  item={recording}
                  fields={fieldsByType[recording.service_type_id] ?? []}
                  onDone={() => {
                    setRecording(null);
                    router.refresh();
                  }}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={notNeeded !== null}
        onOpenChange={(open) => (open ? null : setNotNeeded(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not needed at this property?</AlertDialogTitle>
            <AlertDialogDescription>
              {notNeeded?.service_name} will show as not needed, in grey, instead of missing. You
              can change it back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="not-needed-reason">Why not?</Label>
            <Input
              id="not-needed-reason"
              value={reason}
              placeholder="For example, no gas supply"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !reason.trim()}
              onClick={() =>
                notNeeded &&
                run(
                  () => markNotNeeded(propertyId, notNeeded.service_type_id, { reason }),
                  () => setNotNeeded(null),
                )
              }
            >
              Mark not needed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemCard({
  item,
  propertyId,
  fields,
  documentName,
  pending,
  onRecord,
  onNotNeeded,
  onNeeded,
}: {
  item: ComplianceItem;
  propertyId: string;
  fields: ServiceField[];
  documentName?: string;
  pending: boolean;
  onRecord: () => void;
  onNotNeeded: () => void;
  onNeeded: () => void;
}) {
  const details = fields
    .map((field) => ({ field, value: formatDetail(field, item.details[field.key]) }))
    .filter((entry) => entry.value !== null);
  const rag = ragOf(item.status);

  return (
    <Card
      size="sm"
      data-testid="compliance-item"
      data-type={item.system_key ?? item.service_type_id}
      className={cn("border-l-4", {
        "border-l-destructive": rag === "red",
        "border-l-amber-500": rag === "amber",
        "border-l-emerald-600": rag === "green",
        "border-l-muted": rag === "grey",
      })}
    >
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="font-medium">{item.service_name}</h4>
          <StatusBadge status={item.status} />
        </div>

        {item.not_required ? (
          <p className="text-sm text-muted-foreground">
            Not needed here: {item.not_required_reason}
          </p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Last done</dt>
            <dd>{item.last_done_on ? formatUkDate(item.last_done_on) : "Not recorded"}</dd>
            <dt className="text-muted-foreground">{item.expiry_label}</dt>
            <dd>
              {item.expires_on ? formatUkDate(item.expires_on) : "Not recorded"}
              {item.expires_on ? (
                <span className="text-muted-foreground"> · {daysLeftLabel(item.days_left)}</span>
              ) : null}
            </dd>
            {details.map(({ field, value }) => (
              <div key={field.key} className="contents">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="break-words whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {!item.not_required && item.document_id && documentName ? (
          <a
            href={`/properties/${propertyId}/documents/${item.document_id}/download`}
            className="flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
          >
            <Download className="size-4" aria-hidden />
            {documentName}
          </a>
        ) : !item.not_required && item.requires_document ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileWarning className="size-4" aria-hidden />
            Certificate not uploaded yet
          </p>
        ) : null}
        {item.notes && !item.not_required ? (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{item.notes}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-3">
          {item.not_required ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={onNeeded}>
              Needed again
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={onRecord} aria-label={`Record ${item.service_name}`}>
                {item.property_service_id && item.expires_on ? "Record a new check" : "Record"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onNotNeeded}
                aria-label={`${item.service_name} not needed here`}
              >
                Not needed here
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RecordCheckForm({
  orgId,
  propertyId,
  today,
  item,
  fields,
  onDone,
}: {
  orgId: string;
  propertyId: string;
  today: string;
  item: ComplianceItem;
  fields: ServiceField[];
  onDone: () => void;
}) {
  const form = useFormValues<CheckFormValues>({
    lastDoneOn: "",
    expiresOn: "",
    notes: item.notes ?? "",
  });
  const [details, setDetails] = useState(() => detailsToForm(fields, item.details));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const expiryLabel = item.expiry_label === "Expires" ? "Expiry date" : item.expiry_label;

  function changeLastDone(value: string) {
    form.set("lastDoneOn", value);
    if (!expiryTouched) {
      form.set("expiresOn", value ? (expiryFrom(value, item.validity_months) ?? "") : "");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = file ? fileProblem(file) : null;
    if (problem) {
      setErrors({ file: problem });
      return;
    }
    startTransition(async () => {
      let upload: { path: string; fileName: string } | null = null;
      if (file) {
        // Straight from the browser to the private bucket, under the user's session.
        const path = documentPath(orgId, propertyId, file.name, crypto.randomUUID());
        const { error } = await createClient()
          .storage.from(DOCUMENTS_BUCKET)
          .upload(path, file, { contentType: fileContentType(file)!, upsert: false });
        if (error) {
          toast.error("We couldn't upload that certificate. Please try again.");
          return;
        }
        upload = { path, fileName: file.name };
      }
      const result = await recordCheck(propertyId, item.service_type_id, {
        ...form.values,
        details,
        upload,
      });
      if (result.status === "error") {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onDone();
    });
  }

  const error = (key: string) => (errors[key] ? [errors[key]!] : undefined);

  return (
    <FormIdPrefix value={form.prefix}>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
        aria-label="Record a check"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field name="lastDoneOn" label="Done on" error={error("lastDoneOn")}>
            <Input
              {...form.field("lastDoneOn")}
              type="date"
              max={today}
              onChange={(event) => changeLastDone(event.target.value)}
            />
          </Field>
          <Field
            name="expiresOn"
            label={expiryLabel}
            error={error("expiresOn")}
            hint={item.validity_months ? `Lasts ${item.validity_months} months` : undefined}
          >
            <Input
              {...form.field("expiresOn")}
              type="date"
              onChange={(event) => {
                setExpiryTouched(true);
                form.set("expiresOn", event.target.value);
              }}
            />
          </Field>
        </div>

        {fields.map((field) => {
          const props = {
            id: `${form.prefix}${field.key}`,
            name: field.key,
            value: details[field.key] ?? "",
            "aria-invalid": errors[field.key] ? true : undefined,
            onChange: (
              event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
            ) => setDetails((current) => ({ ...current, [field.key]: event.target.value })),
          };
          return (
            <Field
              key={field.key}
              name={field.key}
              label={`${field.label} (optional)`}
              error={error(field.key)}
            >
              {field.kind === "choice" ? (
                <select {...props} className={selectClass}>
                  <option value="">Choose…</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.kind === "long_text" ? (
                <Textarea {...props} rows={3} />
              ) : (
                <Input
                  {...props}
                  type={field.kind === "date" ? "date" : "text"}
                  inputMode={field.kind === "number" ? "decimal" : undefined}
                  autoComplete="off"
                />
              )}
            </Field>
          );
        })}

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${form.prefix}file`}>
            {item.requires_document ? "Certificate" : "Certificate or report (optional)"}
          </Label>
          <input
            ref={fileInput}
            id={`${form.prefix}file`}
            type="file"
            accept={ACCEPTED_FILES}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setErrors((current) => ({ ...current, file: "" }));
            }}
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {item.document_id
              ? "Leave empty to keep the current certificate."
              : item.requires_document
                ? "It shows as missing until the certificate is uploaded."
                : "PDF, photo or Word document, up to 20 MB."}
          </p>
          {errors.file ? <p className="text-xs text-destructive">{errors.file}</p> : null}
        </div>

        <Field name="notes" label="Notes (optional)" error={error("notes")}>
          <Textarea {...form.field("notes")} rows={3} />
        </Field>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </FormIdPrefix>
  );
}
