"use client";

import { Copy, Link2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPortalLink, revokePortalLink } from "@/app/(app)/applicants/[onboardingId]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatUkDate } from "@/lib/format";

type PortalLinkCardProps = {
  onboardingId: string;
  /** When the current link stops working, or null if there's no live link. */
  liveUntil: string | null;
  applicantFirstName: string;
  applicantEmail: string | null;
  place: string;
  organisation: string;
};

/**
 * The applicant's secure link. It's shown once, straight after it's made,
 * because only its hash is stored. Making a new one switches the old one off.
 */
export function PortalLinkCard({
  onboardingId,
  liveUntil,
  applicantFirstName,
  applicantEmail,
  place,
  organisation,
}: PortalLinkCardProps) {
  const router = useRouter();
  const [fresh, setFresh] = useState<{ link: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function makeLink() {
    startTransition(async () => {
      const result = await createPortalLink(onboardingId);
      if (result.status === "error" || !result.link || !result.expiresAt) {
        toast.error(result.message);
        return;
      }
      setFresh({ link: result.link, expiresAt: result.expiresAt });
      toast.success("New link ready.");
      router.refresh();
    });
  }

  function switchOff() {
    startTransition(async () => {
      const result = await revokePortalLink(onboardingId);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      setFresh(null);
      toast.success(result.message);
      router.refresh();
    });
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  const mailto = (link: string, expiresAt: string) => {
    const subject = `Your application for ${place}`;
    const body = [
      `Hi ${applicantFirstName},`,
      "",
      `Here's your secure link to apply for ${place}. You can fill in your application, upload your ID and see how things are going:`,
      "",
      link,
      "",
      `The link works until ${formatUkDate(expiresAt)}. Please don't share it.`,
      "",
      `Thanks,`,
      organisation,
    ].join("\n");
    return `mailto:${applicantEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Card data-testid="portal-link-card">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="size-4" aria-hidden />
          <h2 className="font-semibold">Applicant link</h2>
        </div>

        {fresh ? (
          <>
            <p className="text-sm text-muted-foreground">
              Send this to {applicantFirstName} now. For security it won&apos;t be shown again, but
              you can always make a new one. It works until {formatUkDate(fresh.expiresAt)}.
            </p>
            <Input
              readOnly
              value={fresh.link}
              aria-label="Applicant link"
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copy(fresh.link)}>
                <Copy aria-hidden />
                Copy link
              </Button>
              <a
                href={mailto(fresh.link, fresh.expiresAt)}
                className={buttonVariants({ variant: "outline" })}
              >
                <Mail aria-hidden />
                Email it
              </a>
            </div>
          </>
        ) : liveUntil ? (
          <p className="text-sm text-muted-foreground">
            A link is live until {formatUkDate(liveUntil)}. If {applicantFirstName} has lost it,
            make a new one: the old link will stop working.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Make a secure link so {applicantFirstName} can fill in the application, upload their ID
            and see their progress. No account needed.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant={fresh ? "outline" : "default"} onClick={makeLink} disabled={pending}>
            {liveUntil || fresh ? "Make a new link" : "Create link"}
          </Button>
          {liveUntil || fresh ? (
            <Button variant="ghost" onClick={switchOff} disabled={pending}>
              Switch off link
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
