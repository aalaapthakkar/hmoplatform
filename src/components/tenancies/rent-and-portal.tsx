"use client";

import { Copy, Mail, Smartphone, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inviteToPortal } from "@/app/(app)/tenancies/[tenancyId]/rent-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPence, formatUkDate } from "@/lib/format";
import { balanceLabel } from "@/lib/rent/ledger";
import type { TenancySummary } from "@/lib/tenancies/summary";
import { cn } from "@/lib/utils";

/** The rent balance and each tenant's access to the tenant portal. */
export function RentAndPortal({
  tenancy,
  place,
  organisation,
}: {
  tenancy: TenancySummary;
  place: string;
  organisation: string;
}) {
  const canInvite = ["prospective", "active", "ending"].includes(tenancy.status);
  const tenants = tenancy.tenants.filter((tenant) => tenant.id);

  return (
    <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
      <section className="flex flex-col gap-2" aria-labelledby={`rent-${tenancy.id}`}>
        <h4 id={`rent-${tenancy.id}`} className="flex items-center gap-2 font-medium">
          <Wallet className="size-4" aria-hidden />
          Rent
        </h4>
        {tenancy.balancePence !== null && tenancy.group !== "upcoming" ? (
          <p
            className={cn("text-sm", tenancy.balancePence > 0 && "font-medium text-destructive")}
            data-testid="rent-balance"
          >
            {balanceLabel(tenancy.balancePence)}
            {tenancy.arrearsPence ? ` · ${formatPence(tenancy.arrearsPence)} overdue` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Rent is charged from the move-in date.</p>
        )}
        <div>
          <Link
            href={`/tenancies/${tenancy.id}/statement`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Rent statement
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`portal-${tenancy.id}`}>
        <h4 id={`portal-${tenancy.id}`} className="flex items-center gap-2 font-medium">
          <Smartphone className="size-4" aria-hidden />
          Tenant portal
        </h4>
        {tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenant recorded.</p>
        ) : (
          tenants.map((tenant) => (
            <PortalInvite
              key={tenant.id}
              tenantId={tenant.id!}
              tenant={tenant}
              showName={tenants.length > 1}
              canInvite={canInvite}
              place={place}
              organisation={organisation}
            />
          ))
        )}
        <div>
          <Link
            href={`/messages/${tenancy.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Messages
          </Link>
        </div>
      </section>
    </div>
  );
}

function PortalInvite({
  tenantId,
  tenant,
  showName,
  canInvite,
  place,
  organisation,
}: {
  tenantId: string;
  tenant: TenancySummary["tenants"][number];
  showName: boolean;
  canInvite: boolean;
  place: string;
  organisation: string;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<{ link: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const { portal } = tenant;

  function invite() {
    startTransition(async () => {
      const result = await inviteToPortal(tenantId);
      if (result.status === "error" || !result.link || !result.expiresAt) {
        toast.error(result.message);
        return;
      }
      setFresh({ link: result.link, expiresAt: result.expiresAt });
      toast.success("Invite ready.");
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
    const subject = `Your tenant portal for ${place}`;
    const body = [
      `Hi ${tenant.firstName},`,
      "",
      `You can now use the tenant portal for ${place}. See your rent statement and documents, report repairs and message us, all from your phone.`,
      "",
      "Open this link to set your password:",
      "",
      link,
      "",
      `The link works until ${formatUkDate(expiresAt)}. Please don't share it.`,
      "",
      "Thanks,",
      organisation,
    ].join("\n");
    return `mailto:${tenant.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="flex flex-col gap-2" data-testid="portal-invite">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {showName ? <span className="font-medium">{tenant.name}</span> : null}
        <Badge variant={portal.state === "joined" ? "default" : "outline"}>
          {portal.state === "joined"
            ? "Joined"
            : portal.state === "invited"
              ? `Invited until ${formatUkDate(portal.until)}`
              : "Not invited"}
        </Badge>
      </div>

      {fresh ? (
        <>
          <p className="text-xs text-muted-foreground">
            Send this to {tenant.firstName} now. For security it won&apos;t be shown again.
          </p>
          <Input
            readOnly
            value={fresh.link}
            aria-label="Portal invite link"
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copy(fresh.link)}>
              <Copy aria-hidden />
              Copy link
            </Button>
            <a
              href={mailto(fresh.link, fresh.expiresAt)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Mail aria-hidden />
              Email it
            </a>
          </div>
        </>
      ) : null}

      {canInvite && portal.state !== "joined" ? (
        <div>
          <Button
            size="sm"
            variant={fresh ? "ghost" : "outline"}
            onClick={invite}
            disabled={pending}
          >
            {portal.state === "invited" || fresh ? "Make a new invite" : "Invite to portal"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
