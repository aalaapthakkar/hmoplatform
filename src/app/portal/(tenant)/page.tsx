import { BookOpen, ChevronRight, MessageCircle, Wrench } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NoTenancyYet, PortalHeading } from "@/components/portal/portal-bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPence, formatUkDate } from "@/lib/format";
import { rentSummary } from "@/lib/portal/home";
import { requireTenant } from "@/lib/portal/queries";
import { getStatement } from "@/lib/rent/queries";
import { cn } from "@/lib/utils";

export default function PortalHomePage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const { home } = await requireTenant();
  if (!home) {
    return (
      <>
        <PortalHeading title="Your home" />
        <NoTenancyYet />
      </>
    );
  }
  const statement = await getStatement(home.tenancyId);
  const { room, property } = home;
  const when =
    home.status === "prospective"
      ? `Moving in on ${formatUkDate(home.startDate)}`
      : home.status === "ended"
        ? `Lived here ${formatUkDate(home.startDate)} to ${home.endDate ? formatUkDate(home.endDate) : "–"}`
        : home.endDate
          ? `Moving out on ${formatUkDate(home.endDate)}`
          : `Living here since ${formatUkDate(home.startDate)}`;

  return (
    <>
      <PortalHeading title={room.name}>{property.address}</PortalHeading>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm" data-testid="home-when">
            {when}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Rent</dt>
            <dd>{rentSummary(home)}</dd>
            <dt className="text-muted-foreground">Deposit</dt>
            <dd>{formatPence(home.depositPence)}</dd>
            {room.sizeSqm ? (
              <>
                <dt className="text-muted-foreground">Room size</dt>
                <dd>{room.sizeSqm} m²</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Bills</dt>
            <dd>{property.billsIncluded ? "Included in your rent" : "Not included"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Link href="/portal/rent" className="group">
        <Card className="transition-colors group-hover:bg-muted/50">
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Rent balance</span>
              <span
                className={cn(
                  "text-xl font-semibold",
                  statement.balancePence > 0 && "text-destructive",
                )}
                data-testid="home-balance"
              >
                {statement.balanceLabel}
              </span>
            </div>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </CardContent>
        </Card>
      </Link>

      <div className="grid grid-cols-3 gap-3">
        <QuickLink
          href="/portal/repairs/new"
          icon={<Wrench aria-hidden />}
          label="Report a repair"
        />
        <QuickLink
          href="/portal/messages"
          icon={<MessageCircle aria-hidden />}
          label="Message us"
        />
        <QuickLink href="/portal/welcome" icon={<BookOpen aria-hidden />} label="Welcome pack" />
      </div>

      {room.features?.length ? (
        <Section title="Your room">
          <Tags items={room.features} />
        </Section>
      ) : null}
      {property.amenities?.length ? (
        <Section title="In the house">
          <Tags items={property.amenities} />
        </Section>
      ) : null}
      {property.houseRules ? (
        <Section title="House rules">
          <p className="text-sm whitespace-pre-line">{property.houseRules}</p>
        </Section>
      ) : null}
    </>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-background p-2 text-center text-xs font-medium transition-colors hover:bg-muted/50 [&_svg]:size-5 [&_svg]:text-primary"
    >
      {icon}
      {label}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Tags({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item}>
          <Badge variant="outline">{item}</Badge>
        </li>
      ))}
    </ul>
  );
}
