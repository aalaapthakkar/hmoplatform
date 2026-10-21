"use client";

import { AlertTriangle, Mail, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  moveTenancy,
  startOnboarding,
} from "@/app/(app)/properties/[propertyId]/rooms/[roomId]/actions";
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
import { AgreementSection } from "@/components/esign/agreement-section";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { TenancySummary } from "@/lib/tenancies/summary";
import { cn } from "@/lib/utils";
import { RentAndPortal } from "./rent-and-portal";
import { MoveInDateForm, NoticeForm, TenancyForm } from "./tenancy-forms";

export type RoomInfo = {
  id: string;
  name: string;
  statusLabel: string;
  archived: boolean;
  rent: string;
  rentPounds: string;
  rentFrequency: "monthly" | "weekly";
};

type Move = "end_tenancy" | "start_tenancy" | "cancel_tenancy";

const MOVE_COPY: Record<Move, { title: string; body: string; confirm: string }> = {
  end_tenancy: {
    title: "Mark this tenancy as ended?",
    body: "Only do this once the tenant has moved out. The room becomes available, and the tenancy moves to the room's history.",
    confirm: "Mark as ended",
  },
  start_tenancy: {
    title: "Move this tenant in?",
    body: "The tenancy becomes current and the room is shown as let.",
    confirm: "Move in",
  },
  cancel_tenancy: {
    title: "Cancel this upcoming tenancy?",
    body: "It stays in the room's history as cancelled, and you can line up another tenant.",
    confirm: "Cancel tenancy",
  },
};

const GROUP_LABELS = { upcoming: "Upcoming", current: "Current", past: "Past" } as const;

type RoomTenanciesProps = {
  propertyId: string;
  room: RoomInfo;
  tenancies: TenancySummary[];
  selectedId: string | null;
  canAdd: boolean;
  today: string;
  /** "Room 1, 12 High Street", for messages to tenants. */
  place: string;
  organisation: string;
};

export function RoomTenancies({
  propertyId,
  room,
  tenancies,
  selectedId,
  canAdd,
  today,
  place,
  organisation,
}: RoomTenanciesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const wide = useMediaQuery("(min-width: 768px)");
  const [panel, setPanel] = useState<"add" | "notice" | "move-in" | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = tenancies.find((tenancy) => tenancy.id === selectedId) ?? null;
  const hasCurrent = tenancies.some((tenancy) => tenancy.group === "current");

  /** After a change: close everything and reload, showing a new tenancy if one was added. */
  function done(message: string, tenancyId?: string) {
    toast.success(message);
    setPanel(null);
    setMove(null);
    if (tenancyId) router.push(`${pathname}?tenancy=${tenancyId}`, { scroll: false });
    router.refresh();
  }

  function confirmMove() {
    if (!selected || !move) return;
    startTransition(async () => {
      const result = await moveTenancy(selected.id, move);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      done(result.message);
    });
  }

  return (
    <section aria-labelledby="room-heading" className="flex flex-col gap-4">
      <Link
        href={`/properties/${propertyId}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← All rooms
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="room-heading" className="text-xl font-semibold">
              {room.name}
            </h2>
            <Badge variant="secondary" data-testid="room-status">
              {room.statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{room.rent}</p>
        </div>
        {canAdd ? (
          <Button size="lg" onClick={() => setPanel("add")}>
            <Plus aria-hidden />
            Add tenancy
          </Button>
        ) : null}
      </div>

      {tenancies.length > 0 ? (
        <TenancySwitcher
          tenancies={tenancies}
          selectedId={selected?.id ?? null}
          hrefFor={(id) => `${pathname}?tenancy=${id}`}
          onSelect={(id) => router.push(`${pathname}?tenancy=${id}`)}
        />
      ) : null}

      {selected ? (
        <TenancyPanel
          tenancy={selected}
          place={place}
          organisation={organisation}
          hasCurrent={hasCurrent}
          onNotice={() => setPanel("notice")}
          onMove={setMove}
          onChangeMoveIn={() => setPanel("move-in")}
          onStartOnboarding={() =>
            startTransition(async () => {
              const result = await startOnboarding(selected.id);
              if (result.status === "error") {
                toast.error(result.message);
                return;
              }
              toast.success(result.message);
              router.push(`/applicants/${result.id}`);
            })
          }
          pending={pending}
        />
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {room.archived
            ? "This room is archived, so it can't be let."
            : "No tenancies yet. Add the first one when you've found a tenant."}
        </div>
      )}

      <Sheet open={panel !== null} onOpenChange={(open) => (open ? null : setPanel(null))}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          className="max-h-[90svh] overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          {panel === "add" ? (
            <TenancyForm
              roomId={room.id}
              roomRent={room.rentPounds}
              roomFrequency={room.rentFrequency}
              existing={tenancies.map((tenancy) => tenancy.dates)}
              today={today}
              onDone={done}
            />
          ) : null}
          {panel === "notice" && selected ? (
            <NoticeForm tenancy={selected} today={today} onDone={done} />
          ) : null}
          {panel === "move-in" && selected ? (
            <MoveInDateForm tenancy={selected} today={today} onDone={done} />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={move !== null} onOpenChange={(open) => (open ? null : setMove(null))}>
        <AlertDialogContent>
          {move ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{MOVE_COPY[move].title}</AlertDialogTitle>
                <AlertDialogDescription>{MOVE_COPY[move].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Go back</AlertDialogCancel>
                <AlertDialogAction
                  variant={move === "start_tenancy" ? "default" : "destructive"}
                  disabled={pending}
                  onClick={confirmMove}
                >
                  {pending ? "Saving…" : MOVE_COPY[move].confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * Jumps between the room's upcoming, current and past tenancies: a row of
 * tabs on wider screens, a dropdown on a phone. The choice is in the URL.
 */
function TenancySwitcher({
  tenancies,
  selectedId,
  hrefFor,
  onSelect,
}: {
  tenancies: TenancySummary[];
  selectedId: string | null;
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
}) {
  const selectId = useId();
  const label = (tenancy: TenancySummary) =>
    `${tenancy.group === "past" ? tenancy.statusLabel : GROUP_LABELS[tenancy.group]}: ${tenancy.tenantNames}, ${tenancy.when}`;

  return (
    <div>
      <div className="flex flex-col gap-2 md:hidden">
        <label htmlFor={selectId} className="text-sm font-medium">
          Tenancy
        </label>
        <select
          id={selectId}
          value={selectedId ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30"
        >
          {tenancies.map((tenancy) => (
            <option key={tenancy.id} value={tenancy.id}>
              {label(tenancy)}
            </option>
          ))}
        </select>
      </div>

      <nav aria-label="Tenancies on this room" className="hidden md:block">
        <ul className="flex flex-wrap gap-2">
          {tenancies.map((tenancy) => {
            const current = tenancy.id === selectedId;
            return (
              <li key={tenancy.id}>
                <Link
                  href={hrefFor(tenancy.id)}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex flex-col rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted",
                    current && "border-primary bg-primary/5",
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {tenancy.group === "past" ? tenancy.statusLabel : GROUP_LABELS[tenancy.group]}
                  </span>
                  <span className="font-medium">{tenancy.tenantNames}</span>
                  <span className="text-xs text-muted-foreground">{tenancy.when}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function TenancyPanel({
  tenancy,
  place,
  organisation,
  hasCurrent,
  onNotice,
  onMove,
  onChangeMoveIn,
  onStartOnboarding,
  pending,
}: {
  tenancy: TenancySummary;
  place: string;
  organisation: string;
  hasCurrent: boolean;
  onNotice: () => void;
  onMove: (move: Move) => void;
  onChangeMoveIn: () => void;
  onStartOnboarding: () => void;
  pending: boolean;
}) {
  return (
    <Card data-testid="tenancy-panel">
      <CardContent className="flex flex-col gap-4">
        {tenancy.canMarkEnded ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            The end date ({tenancy.end}) has passed. Check the tenant has moved out, then mark the
            tenancy as ended.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-medium">{tenancy.tenantNames}</h3>
          <Badge variant={tenancy.group === "current" ? "default" : "outline"}>
            {tenancy.statusLabel}
          </Badge>
        </div>

        {tenancy.tenants.some((tenant) => tenant.email || tenant.phone) ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {tenancy.tenants.map((tenant) => (
              <span key={tenant.name} className="flex flex-wrap gap-x-4 gap-y-1">
                {tenant.email ? (
                  <a
                    href={`mailto:${tenant.email}`}
                    className="flex min-h-6 items-center gap-1.5 break-all underline-offset-4 hover:underline"
                  >
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    {tenant.email}
                  </a>
                ) : null}
                {tenant.phone ? (
                  <a
                    href={`tel:${tenant.phone.replace(/\s+/g, "")}`}
                    className="flex min-h-6 items-center gap-1.5 underline-offset-4 hover:underline"
                  >
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    {tenant.phone}
                  </a>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Start date</dt>
          <dd>{tenancy.start}</dd>
          <dt className="text-muted-foreground">Rent</dt>
          <dd>{tenancy.rent}</dd>
          <dt className="text-muted-foreground">Rent due</dt>
          <dd>{tenancy.dueDay}</dd>
          <dt className="text-muted-foreground">Deposit</dt>
          <dd>{tenancy.deposit}</dd>
          <dt className="text-muted-foreground">Term</dt>
          <dd>Periodic (no fixed end date)</dd>
          {tenancy.notice ? (
            <>
              <dt className="text-muted-foreground">Notice given</dt>
              <dd>
                {tenancy.notice}
                {tenancy.endReason ? ` · ${tenancy.endReason}` : ""}
              </dd>
            </>
          ) : null}
          {tenancy.end ? (
            <>
              <dt className="text-muted-foreground">
                {tenancy.status === "ended" ? "Ended" : "Last day"}
              </dt>
              <dd>{tenancy.end}</dd>
            </>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {tenancy.status === "active" ? <Button onClick={onNotice}>Record notice</Button> : null}
          {tenancy.status === "ending" ? (
            <>
              <Button
                onClick={() => onMove("end_tenancy")}
                disabled={!tenancy.canMarkEnded}
                title={
                  tenancy.canMarkEnded ? undefined : `You can mark it ended from ${tenancy.end}`
                }
              >
                Mark as ended
              </Button>
              <Button variant="outline" onClick={onNotice}>
                Change notice
              </Button>
            </>
          ) : null}
          {tenancy.status === "prospective" ? (
            <>
              <Button
                onClick={() => onMove("start_tenancy")}
                disabled={!tenancy.canMoveIn || hasCurrent}
              >
                Move in
              </Button>
              {tenancy.onboardingId ? (
                <Link
                  href={`/applicants/${tenancy.onboardingId}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  View onboarding
                </Link>
              ) : (
                <Button variant="outline" onClick={onStartOnboarding} disabled={pending}>
                  Start onboarding
                </Button>
              )}
              <Button variant="outline" onClick={onChangeMoveIn}>
                Change move-in date
              </Button>
              <Button variant="ghost" onClick={() => onMove("cancel_tenancy")}>
                Cancel tenancy
              </Button>
            </>
          ) : null}
        </div>
        {tenancy.status === "prospective" && (!tenancy.canMoveIn || hasCurrent) ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            {!tenancy.canMoveIn
              ? `You can move the tenant in from ${tenancy.start}.`
              : "Mark the current tenancy as ended before moving the next tenant in."}
          </p>
        ) : null}
        {tenancy.status === "ending" && !tenancy.canMarkEnded ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            You can mark it as ended from {tenancy.end}.
          </p>
        ) : null}

        {tenancy.status !== "cancelled" ? (
          <RentAndPortal tenancy={tenancy} place={place} organisation={organisation} />
        ) : null}

        {tenancy.status !== "cancelled" ? (
          <AgreementSection
            tenancyId={tenancy.id}
            editable={["prospective", "active", "ending"].includes(tenancy.status)}
            guarantor={tenancy.guarantor}
            removedGuarantors={tenancy.removedGuarantors}
            requests={tenancy.signatureRequests}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
