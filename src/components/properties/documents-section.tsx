"use client";

import { Download, FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveDocument, recordDocument } from "@/app/(app)/properties/[propertyId]/actions";
import { Field, selectClass, useFormValues } from "@/components/forms/fields";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DocumentSummary, ExpiryState } from "@/lib/properties/documents";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_FILES,
  DOCUMENT_TYPE_LABELS,
  documentFormSchema,
  documentPath,
  DOCUMENTS_BUCKET,
  fileContentType,
  fileProblem,
} from "@/lib/validation/document";

type DocumentsSectionProps = {
  orgId: string;
  propertyId: string;
  documents: DocumentSummary[];
  archived: DocumentSummary[];
};

export function DocumentsSection({
  orgId,
  propertyId,
  documents,
  archived,
}: DocumentsSectionProps) {
  const router = useRouter();
  const [archiving, setArchiving] = useState<DocumentSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmArchive() {
    const document = archiving;
    if (!document) return;
    startTransition(async () => {
      const result = await archiveDocument(propertyId, document.id);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setArchiving(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="documents-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="documents-heading" className="text-xl font-semibold">
          Documents
        </h2>
        <p className="text-sm text-muted-foreground">
          Certificates, licences and agreements for this property. Only your organisation can see
          them.
        </p>
      </div>

      <UploadForm orgId={orgId} propertyId={propertyId} onUploaded={() => router.refresh()} />

      {documents.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No documents yet. Upload the gas safety certificate, EICR, EPC and HMO licence to keep
          track of when they expire.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Documents">
          {documents.map((document) => (
            <li key={document.id}>
              <DocumentRow
                propertyId={propertyId}
                document={document}
                onArchive={() => setArchiving(document)}
              />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <details className="rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Show archived documents ({archived.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {archived.map((document) => (
              <li key={document.id}>
                <DocumentRow propertyId={propertyId} document={document} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(open) => (open ? null : setArchiving(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.fileName}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be moved to archived documents. The file is kept and you can still download
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={confirmArchive}>
              {pending ? "Archiving…" : "Archive document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

const EXPIRY_BADGES: Record<ExpiryState, { label: string; className: string } | null> = {
  none: null,
  valid: null,
  soon: {
    label: "Expires soon",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  },
  expired: { label: "Expired", className: "bg-destructive text-white" },
};

function DocumentRow({
  propertyId,
  document,
  onArchive,
}: {
  propertyId: string;
  document: DocumentSummary;
  onArchive?: () => void;
}) {
  const badge = EXPIRY_BADGES[document.expiryState];
  return (
    <Card size="sm" data-testid="document-row">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FileText className="hidden size-8 shrink-0 text-muted-foreground sm:block" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{document.typeLabel}</p>
            {badge ? <Badge className={badge.className}>{badge.label}</Badge> : null}
          </div>
          <p className="truncate text-muted-foreground">{document.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {document.expiry ? `Expires ${document.expiry} · ` : ""}
            Uploaded {document.uploadedOn} by {document.uploadedBy}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/properties/${propertyId}/documents/${document.id}/download`}
            className={cn(buttonVariants({ variant: "outline" }))}
            aria-label={`Download ${document.fileName}`}
          >
            <Download aria-hidden />
            Download
          </a>
          {onArchive ? (
            <Button variant="ghost" onClick={onArchive} aria-label={`Archive ${document.fileName}`}>
              Archive
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function UploadForm({
  orgId,
  propertyId,
  onUploaded,
}: {
  orgId: string;
  propertyId: string;
  onUploaded: () => void;
}) {
  const form = useFormValues({ documentType: "", expiryDate: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = form.validate(documentFormSchema);
    const problem = file ? fileProblem(file) : "Choose a file to upload.";
    setFileError(problem);
    if (!details || problem || !file) return;

    startTransition(async () => {
      // The file goes straight from the browser to the private bucket, under
      // the user's session, so Storage's own rules apply.
      const path = documentPath(orgId, propertyId, file.name, crypto.randomUUID());
      const { error } = await createClient()
        .storage.from(DOCUMENTS_BUCKET)
        .upload(path, file, { contentType: fileContentType(file)!, upsert: false });
      if (error) {
        toast.error("We couldn't upload that file. Please try again.");
        return;
      }

      const result = await recordDocument(propertyId, {
        ...form.values,
        path,
        fileName: file.name,
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      form.setValues({ documentType: "", expiryDate: "" });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <h3 className="font-medium">Upload a document</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="documentType" label="Type" error={form.errors.documentType}>
              <select {...form.field("documentType")} className={selectClass}>
                <option value="">Choose…</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="expiryDate"
              label="Expiry date (optional)"
              hint="We'll flag it once it has expired."
              error={form.errors.expiryDate}
            >
              <Input {...form.field("expiryDate")} type="date" />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={fileId} className="text-sm font-medium">
              File
            </label>
            <input
              ref={fileInput}
              id={fileId}
              type="file"
              accept={ACCEPTED_FILES}
              aria-invalid={fileError ? true : undefined}
              aria-describedby={`${fileId}-hint${fileError ? ` ${fileId}-error` : ""}`}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setFileError(null);
              }}
              className="text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p id={`${fileId}-hint`} className="text-xs text-muted-foreground">
              PDF, photo (JPG, PNG or HEIC) or Word document, up to 20 MB.
            </p>
            {fileError ? (
              <p id={`${fileId}-error`} className="text-xs text-destructive">
                {fileError}
              </p>
            ) : null}
          </div>
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              <Upload aria-hidden />
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
