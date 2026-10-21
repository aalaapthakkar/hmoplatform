"use client";

import { Download, FileSignature, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addGuarantor,
  type GuarantorFormValues,
  refreshSignatures,
  removeGuarantor,
  sendForSignature,
  syncSignedCopies,
} from "@/app/(app)/tenancies/[tenancyId]/actions";
import { Field, FormIdPrefix, useFormValues } from "@/components/forms/fields";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_KIND_LABELS } from "@/lib/documents/merge";
import { formatUkDate } from "@/lib/format";
import type { GuarantorRow, SignatureRequestRow } from "@/lib/tenancies/summary";
import { cn } from "@/lib/utils";

const REQUEST_STATUS: Record<SignatureRequestRow["status"], string> = {
  sent: "Waiting for signatures",
  partly_signed: "Partly signed",
  completed: "Signed",
  declined: "Declined",
  cancelled: "Cancelled",
  error: "Problem with the provider",
};

const ROLE_LABELS = { tenant: "Tenant", guarantor: "Guarantor", organisation: "You" } as const;

type AgreementSectionProps = {
  tenancyId: string;
  /** Upcoming or current tenancies can change; past ones only show their history. */
  editable: boolean;
  guarantor: GuarantorRow | null;
  removedGuarantors: GuarantorRow[];
  requests: SignatureRequestRow[];
};

export function AgreementSection({
  tenancyId,
  editable,
  guarantor,
  removedGuarantors,
  requests,
}: AgreementSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const synced = useRef(false);

  const open = requests.some(
    (request) => request.status === "sent" || request.status === "partly_signed",
  );
  const hasTenancyRequest = requests.some(
    (request) =>
      request.kind === "tenancy_agreement" &&
      ["sent", "partly_signed", "completed"].includes(request.status),
  );
  const hasGuarantorRequest = requests.some(
    (request) =>
      request.kind === "guarantor_agreement" &&
      ["sent", "partly_signed", "completed"].includes(request.status),
  );
  const canSend = editable && (!hasTenancyRequest || (guarantor !== null && !hasGuarantorRequest));
  const needsSignedCopy = requests.some(
    (request) => request.status === "completed" && !request.signed_document_id,
  );

  // A webhook may have marked a request complete: save its signed copy now.
  useEffect(() => {
    if (!needsSignedCopy || synced.current) return;
    synced.current = true;
    void syncSignedCopies(tenancyId).then((result) => {
      if (result.status === "success" && result.message) {
        toast.success(result.message);
        router.refresh();
      }
    });
  }, [needsSignedCopy, tenancyId, router]);

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
    <section
      aria-labelledby={`agreement-${tenancyId}`}
      className="flex flex-col gap-4 border-t pt-4"
      data-testid="agreement-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`agreement-${tenancyId}`} className="flex items-center gap-2 font-medium">
          <FileSignature className="size-4" aria-hidden />
          Agreement
        </h4>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/tenancies/${tenancyId}/agreement`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Preview tenancy agreement
          </a>
          {guarantor ? (
            <a
              href={`/tenancies/${tenancyId}/agreement?kind=guarantor_agreement`}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Preview guarantor agreement
            </a>
          ) : null}
        </div>
      </div>

      {/* Guarantor */}
      <div
        className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm"
        data-testid="guarantor"
      >
        {guarantor ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-medium">Guarantor:</span> {guarantor.name} ({guarantor.email})
            </span>
            {editable ? (
              <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
                Remove guarantor requirement
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">No guarantor needed.</span>
            {editable && !adding ? (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                Add guarantor
              </Button>
            ) : null}
          </div>
        )}
        {adding ? (
          <GuarantorForm
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(values) =>
              run(
                () => addGuarantor(tenancyId, values),
                () => setAdding(false),
              )
            }
          />
        ) : null}
        {removedGuarantors.map((removed) => (
          <p key={removed.id} className="text-xs text-muted-foreground">
            {removed.name} was removed as guarantor
            {removed.removed_at ? ` on ${formatUkDate(removed.removed_at)}` : ""}:{" "}
            {removed.removed_reason}
          </p>
        ))}
      </div>

      {/* Signature requests */}
      {requests.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Signature requests">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
              data-testid="signature-request"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{TEMPLATE_KIND_LABELS[request.kind]}</span>
                <Badge
                  variant={request.status === "completed" ? "default" : "outline"}
                  className={cn(
                    request.status === "declined" && "border-destructive text-destructive",
                  )}
                >
                  {REQUEST_STATUS[request.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  sent {formatUkDate(request.sent_at)}
                </span>
              </div>
              <ol className="flex flex-col gap-1">
                {[...request.signature_request_signers]
                  .sort((a, b) => a.signing_order - b.signing_order)
                  .map((signer) => (
                    <li key={signer.email} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {ROLE_LABELS[signer.role]}: {signer.name}
                      </span>
                      <span className="text-muted-foreground">
                        {signer.status === "signed"
                          ? `Signed${signer.signed_at ? ` ${formatUkDate(signer.signed_at)}` : ""}`
                          : signer.status === "declined"
                            ? "Declined"
                            : request.status === "cancelled"
                              ? "Not needed"
                              : "Waiting"}
                      </span>
                    </li>
                  ))}
              </ol>
              {request.cancelled_reason ? (
                <p className="text-xs text-muted-foreground">{request.cancelled_reason}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {request.signed_document_id ? (
                  <a
                    href={`/documents/${request.signed_document_id}/download`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    <Download aria-hidden />
                    Signed copy
                  </a>
                ) : null}
                {request.unsigned_document_id ? (
                  <a
                    href={`/documents/${request.unsigned_document_id}/download`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    As sent
                  </a>
                ) : null}
                {request.provider === "fake" &&
                ["sent", "partly_signed"].includes(request.status) ? (
                  <Link
                    href={`/dev/esign/${request.provider_request_id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Test signing page
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <Button disabled={pending} onClick={() => run(() => sendForSignature(tenancyId))}>
            {pending ? "Sending…" : "Send for signature"}
          </Button>
        ) : null}
        {open ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => refreshSignatures(tenancyId))}
          >
            <RefreshCw aria-hidden />
            Refresh status
          </Button>
        ) : null}
      </div>

      <RemoveGuarantorDialog
        open={removing}
        name={guarantor?.name ?? ""}
        pending={pending}
        onCancel={() => setRemoving(false)}
        onConfirm={(reason) =>
          guarantor &&
          run(
            () => removeGuarantor(guarantor.id, { reason }),
            () => setRemoving(false),
          )
        }
      />
    </section>
  );
}

function GuarantorForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: GuarantorFormValues) => void;
}) {
  const form = useFormValues<GuarantorFormValues>({ name: "", email: "", phone: "", address: "" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Partial<Record<keyof GuarantorFormValues, string[]>> = {};
    if (!form.values.name.trim()) errors.name = ["Enter the guarantor's name"];
    if (!/^\S+@\S+\.\S+$/.test(form.values.email.trim())) {
      errors.email = ["Enter the guarantor's email address"];
    }
    if (Object.keys(errors).length) {
      form.setErrors(errors);
      return;
    }
    onSubmit(form.values);
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3 pt-2"
        aria-label="Add guarantor"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="name" label="Guarantor's name" error={form.errors.name}>
            <Input {...form.field("name")} autoComplete="off" />
          </Field>
          <Field name="email" label="Guarantor's email" error={form.errors.email}>
            <Input {...form.field("email")} type="email" autoComplete="off" />
          </Field>
          <Field name="phone" label="Phone (optional)" error={form.errors.phone}>
            <Input {...form.field("phone")} type="tel" autoComplete="off" />
          </Field>
          <Field name="address" label="Address (optional)" error={form.errors.address}>
            <Input {...form.field("address")} autoComplete="off" />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Add guarantor
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </FormIdPrefix>
  );
}

function RemoveGuarantorDialog({
  open,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the guarantor requirement?</AlertDialogTitle>
          <AlertDialogDescription>
            {name}&apos;s guarantor agreement will be cancelled. The tenancy agreement, and any
            signatures already on it, stay as they are. This is recorded with your name.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="remove-guarantor-reason">Reason</Label>
          <Textarea
            id="remove-guarantor-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            rows={3}
            aria-invalid={error ? true : undefined}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep guarantor</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!reason.trim()) {
                setError("Give a reason");
                return;
              }
              onConfirm(reason.trim());
            }}
          >
            {pending ? "Removing…" : "Remove requirement"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
