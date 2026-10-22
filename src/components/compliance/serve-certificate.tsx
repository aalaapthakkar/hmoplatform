"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { serveCertificate } from "@/app/(app)/properties/[propertyId]/compliance/actions";
import { Button } from "@/components/ui/button";
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
import type { ServiceRecord } from "@/lib/compliance/queries";
import { defaultServeMessage, type ServeRecipient } from "@/lib/compliance/serving";
import { formatUkDateTime } from "@/lib/format";

const key = (recipient: ServeRecipient) => `${recipient.tenancyId}:${recipient.tenantId}`;

/** Sends a certificate to the property's tenants: into their portal, and by email, attached. */
export function ServeCertificate({
  propertyId,
  propertyServiceId,
  documentId,
  certificateName,
  fileName,
  address,
  recipients,
}: {
  propertyId: string;
  propertyServiceId: string | null;
  documentId: string;
  certificateName: string;
  fileName: string;
  address: string;
  recipients: ServeRecipient[];
}) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 768px)");
  const ids = { subject: useId(), message: useId() };
  const suggested = defaultServeMessage(certificateName, address);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(() => new Set(recipients.map(key)));
  const [subject, setSubject] = useState(suggested.subject);
  const [message, setMessage] = useState(suggested.message);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const result = await serveCertificate(propertyId, {
        documentId,
        propertyServiceId,
        recipients: [...chosen],
        subject,
        message,
      });
      if (result.status === "error") toast.error(result.message);
      else toast.success(result.message);
      if (!result.message.startsWith("Choose") && !result.message.startsWith("Add")) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={recipients.length === 0}
        title={recipients.length === 0 ? "No current or upcoming tenants here" : undefined}
        aria-label={`Serve ${certificateName} to tenants`}
      >
        <Send aria-hidden />
        Serve to tenants
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          className="max-h-[90svh] overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Serve {certificateName.toLowerCase()}</SheetTitle>
            <SheetDescription>
              {fileName} goes into each tenant&apos;s portal and is emailed to everyone with an
              email address. A record is kept of who got it, how and when.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Send to</legend>
              {recipients.map((recipient) => (
                <label
                  key={key(recipient)}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(key(recipient))}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(key(recipient));
                        else next.delete(key(recipient));
                        return next;
                      })
                    }
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {recipient.name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {recipient.roomName}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {recipient.email ?? "No email: portal only"}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.subject}>Subject</Label>
              <Input
                id={ids.subject}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.message}>Message</Label>
              <Textarea
                id={ids.message}
                value={message}
                rows={5}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Each email starts &ldquo;Hi&rdquo; and their first name, and says it&apos;s also in
                their portal.
              </p>
            </div>
            <Button size="lg" onClick={send} disabled={pending || chosen.size === 0}>
              {pending
                ? "Sending…"
                : `Send to ${chosen.size} ${chosen.size === 1 ? "tenant" : "tenants"}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

const STATUS_TEXT = {
  sent: "Emailed and in their portal",
  failed: "Email failed; in their portal",
  no_email: "In their portal (no email)",
} as const;

/** The permanent record of serving a certificate: who, how, when, and whether email got out. */
export function ServiceHistory({
  propertyId,
  records,
}: {
  propertyId: string;
  records: ServiceRecord[];
}) {
  if (records.length === 0) return null;
  return (
    <details className="rounded-lg border p-3 text-sm" data-testid="service-history">
      <summary className="cursor-pointer font-medium">
        Served {records.length} {records.length === 1 ? "time" : "times"}
      </summary>
      <ol className="mt-3 flex flex-col gap-3">
        {records.map((record) => (
          <li
            key={record.id}
            className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <span className="text-muted-foreground">
              {formatUkDateTime(record.sentAt)}
              {record.sentBy ? ` by ${record.sentBy}` : ""}
            </span>
            <ul className="flex flex-col gap-1">
              {record.recipients.map((recipient, index) => (
                <li key={index} data-testid="service-recipient">
                  <span className="font-medium">{recipient.name}</span>
                  {recipient.email ? ` (${recipient.email})` : ""}:{" "}
                  {STATUS_TEXT[recipient.emailStatus]}
                  {recipient.error ? `, ${recipient.error}` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <a
        href={`/properties/${propertyId}/compliance/served`}
        download
        className="mt-3 inline-block underline underline-offset-4"
      >
        Download the record (CSV)
      </a>
    </details>
  );
}
