"use client";

import { PoundSterling, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  logRent,
  type LogRentValues,
  type PaymentTarget,
  paymentTargets,
} from "@/app/(app)/rent/actions";
import {
  Field,
  FormIdPrefix,
  PoundsInput,
  selectClass,
  useFormValues,
} from "@/components/forms/fields";
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatPence } from "@/lib/format";
import { balanceLabel, PAYMENT_METHOD_LABELS } from "@/lib/rent/ledger";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "log-rent:open";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Opens the Log rent sheet from anywhere, with a tenancy already chosen if given. */
export function openLogRent(tenancyId?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { tenancyId } }));
}

/** A button that opens Log rent for one tenancy, for lists and statements. */
export function LogRentButton({
  tenancyId,
  label = "Log rent",
  className,
  variant = "default",
}: {
  tenancyId?: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button variant={variant} className={className} onClick={() => openLogRent(tenancyId)}>
      <PoundSterling aria-hidden />
      {label}
    </Button>
  );
}

/** The tenancy the current page is about, if any: a statement, or a room with ?tenancy=. */
function useTenancyInView() {
  const pathname = usePathname();
  const query = useSearchParams();
  const fromPath = pathname.match(/^\/(?:tenancies|messages)\/([^/]+)/)?.[1];
  const candidate = fromPath ?? query.get("tenancy") ?? undefined;
  return candidate && UUID.test(candidate) ? candidate : undefined;
}

/**
 * Log rent: record money received against any tenancy, from any staff page.
 * Opens from the side on a computer and from the bottom on a phone.
 */
export function LogRent() {
  const wide = useMediaQuery("(min-width: 768px)");
  const inView = useTenancyInView();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [targets, setTargets] = useState<PaymentTarget[] | null>(null);

  function show(tenancyId?: string) {
    setChosen(tenancyId ?? inView);
    setTargets(null);
    setOpen(true);
    paymentTargets().then(setTargets, () => {
      toast.error("We couldn't load your tenancies. Please try again.");
      setOpen(false);
    });
  }

  useEffect(() => {
    const listener = (event: Event) =>
      show((event as CustomEvent<{ tenancyId?: string }>).detail?.tenancyId);
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  });

  return (
    <>
      <Button size="sm" onClick={() => show()} className="shrink-0">
        <PoundSterling aria-hidden />
        Log rent
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          className="max-h-[90svh] overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Log rent</SheetTitle>
            <SheetDescription>
              Record money a tenant has paid. It pays off their oldest charges first.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {targets === null ? (
              <div className="h-48 animate-pulse rounded-xl bg-muted" aria-busy="true" />
            ) : (
              <LogRentForm
                key={chosen ?? "none"}
                targets={targets}
                initialTenancy={chosen}
                onDone={() => setOpen(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function LogRentForm({
  targets,
  initialTenancy,
  onDone,
}: {
  targets: PaymentTarget[];
  initialTenancy?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const form = useFormValues<LogRentValues>({
    paidOn: today,
    amount: "",
    method: "bank_transfer",
    reference: "",
  });
  const [tenancyId, setTenancyId] = useState(
    targets.some((target) => target.tenancyId === initialTenancy) ? initialTenancy : undefined,
  );
  const [search, setSearch] = useState("");
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchId = useId();
  const chosen = targets.find((target) => target.tenancyId === tenancyId);

  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = targets
    .filter((target) => {
      const text = `${target.tenantNames} ${target.place}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .slice(0, 8);

  function submit(allowDuplicate: boolean) {
    if (!tenancyId) {
      toast.error("Choose who paid.");
      return;
    }
    startTransition(async () => {
      const result = await logRent({ ...form.values, tenancyId, allowDuplicate });
      if (result.status === "duplicate") {
        setDuplicate(result.message);
        return;
      }
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message, {
        action: {
          label: "View statement",
          onClick: () => router.push(`/tenancies/${result.tenancyId}/statement`),
        },
      });
      onDone();
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDuplicate(null);
    submit(false);
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
        aria-label="Log rent"
      >
        {chosen ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium" data-testid="log-rent-tenant">
                {chosen.tenantNames}
              </span>
              <span className="truncate text-muted-foreground">{chosen.place}</span>
              <span className={cn("text-xs", chosen.arrearsPence > 0 && "text-destructive")}>
                {balanceLabel(chosen.balancePence)}
                {chosen.arrearsPence > 0 ? ` · ${formatPence(chosen.arrearsPence)} overdue` : ""}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTenancyId(undefined);
                setDuplicate(null);
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={searchId}>Who paid?</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={searchId}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tenant, room or address"
                className="pl-8"
                autoComplete="off"
                autoFocus
              />
            </div>
            {targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tenancies to log rent against yet.</p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody matches that.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border" aria-label="Tenancies">
                {matches.map((target) => (
                  <li key={target.tenancyId}>
                    <button
                      type="button"
                      onClick={() => setTenancyId(target.tenancyId)}
                      className="flex w-full items-start justify-between gap-3 p-3 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{target.tenantNames}</span>
                        <span className="truncate text-muted-foreground">{target.place}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          target.arrearsPence > 0 && "text-destructive",
                        )}
                      >
                        {balanceLabel(target.balancePence)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field name="amount" label="Amount">
            <PoundsInput {...form.field("amount")} />
          </Field>
          <Field name="paidOn" label="Paid on">
            <Input {...form.field("paidOn")} type="date" max={today} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="method" label="How">
            <select {...form.field("method")} className={selectClass}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field name="reference" label="Reference (optional)">
            <Input {...form.field("reference")} autoComplete="off" />
          </Field>
        </div>

        {duplicate ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50"
          >
            <p>{duplicate}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => submit(true)} disabled={pending}>
                Log it anyway
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDuplicate(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <Button type="submit" size="lg" disabled={pending || !tenancyId}>
          {pending ? "Logging…" : "Log payment"}
        </Button>
        {chosen ? (
          <Link
            href={`/tenancies/${chosen.tenancyId}/statement`}
            onClick={onDone}
            className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            View their statement
          </Link>
        ) : null}
      </form>
    </FormIdPrefix>
  );
}
