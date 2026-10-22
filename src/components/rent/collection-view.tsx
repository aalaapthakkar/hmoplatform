import { Download } from "lucide-react";
import Link from "next/link";
import { CollectionFiltersBar } from "@/components/rent/collection-filters";
import { LogRentButton } from "@/components/rent/log-rent";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";
import { formatPence, formatUkDateTime, todayInLondon } from "@/lib/format";
import {
  buildCollection,
  type CollectionRow,
  collectionQuery,
  filterCollection,
  monthLabel,
  parseCollectionFilters,
} from "@/lib/rent/collection";
import { CHARGE_STATUS_LABELS, type ChargeStatus } from "@/lib/rent/ledger";
import { getOrgLedgers } from "@/lib/rent/org-ledgers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<ChargeStatus, string> = {
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  part_paid: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  overdue: "bg-destructive text-white",
  due: "bg-muted text-foreground",
};

function StatusBadge({ row }: { row: CollectionRow }) {
  if (!row.status) {
    return (
      <Badge variant="outline">{row.arrearsPence > 0 ? "Owes from before" : "Nothing due"}</Badge>
    );
  }
  return (
    <Badge className={STATUS_CLASSES[row.status]} data-testid="collection-status">
      {CHARGE_STATUS_LABELS[row.status]}
    </Badge>
  );
}

/**
 * Rent collection: who has paid, part paid or is overdue for a month, by
 * tenant and by property, with arrears across every month. Used for the
 * whole organisation (/rent) and for one property's Rent section.
 */
export async function CollectionView({
  basePath,
  params,
  propertyId,
}: {
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  /** Shows one property only, without the property filter. */
  propertyId?: string;
}) {
  const membership = await requireMembership();
  const supabase = await createClient();
  const today = todayInLondon();
  const filters = parseCollectionFilters(params, today);
  if (propertyId) filters.property = propertyId;

  const [sources, { data: lastRun }] = await Promise.all([
    getOrgLedgers(membership.orgId, { propertyId }),
    supabase.rpc("rent_charges_last_run"),
  ]);
  const collection = buildCollection(sources, filters.month);
  const scoped = filters.property
    ? buildCollection(
        sources.filter((source) => source.propertyId === filters.property),
        filters.month,
      )
    : collection;
  const rows = filterCollection(scoped.rows, filters);
  const properties = [
    ...new Map(
      sources
        .filter((source) => source.propertyId)
        .map((source) => [source.propertyId!, source.propertyLabel]),
    ).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exportQuery = collectionQuery(filters);

  return (
    <div className="flex flex-col gap-6">
      <CollectionFiltersBar
        basePath={basePath}
        filters={filters}
        properties={propertyId ? undefined : properties}
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="collection-totals">
        <Total
          label={`Due in ${monthLabel(filters.month)}`}
          value={formatPence(scoped.totals.duePence)}
        />
        <Total label="Collected towards it" value={formatPence(scoped.totals.paidPence)} />
        <Total label="Left to pay" value={formatPence(scoped.totals.leftPence)} />
        <Total
          label={`Total overdue (${scoped.totals.tenantsInArrears} ${scoped.totals.tenantsInArrears === 1 ? "tenant" : "tenants"})`}
          value={formatPence(scoped.totals.arrearsPence)}
          testId="collection-arrears"
          warn={scoped.totals.arrearsPence > 0}
        />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Overdue means not fully paid by the end of the due date.{" "}
          {lastRun
            ? `Rent charges were last brought up to date at ${formatUkDateTime(lastRun)}.`
            : "Rent charges are brought up to date every night."}
        </p>
        <div className="flex gap-2">
          <a
            href={`/rent/export${exportQuery}`}
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden />
            Download CSV
          </a>
          <LogRentButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {sources.length === 0
            ? "No rent to collect yet. Rent is charged once a tenant moves in."
            : "Nothing matches these filters."}
        </p>
      ) : (
        <>
          {/* A table on a computer. */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm" aria-label="Rent by tenant">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Tenant</th>
                  <th className="p-3 font-medium">Property</th>
                  <th className="p-3 text-right font-medium">Due</th>
                  <th className="p-3 text-right font-medium">Paid</th>
                  <th className="p-3 text-right font-medium">Left</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 text-right font-medium">Total overdue</th>
                  <th className="p-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.tenancyId} data-testid="collection-row">
                    <td className="p-3">
                      <Link
                        href={`/tenancies/${row.tenancyId}/statement`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.tenantNames}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {row.roomName}, {row.propertyLabel}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatPence(row.duePence)}</td>
                    <td className="p-3 text-right tabular-nums">{formatPence(row.paidPence)}</td>
                    <td className="p-3 text-right tabular-nums">{formatPence(row.leftPence)}</td>
                    <td className="p-3">
                      <StatusBadge row={row} />
                    </td>
                    <td
                      className={cn(
                        "p-3 text-right tabular-nums",
                        row.arrearsPence > 0 && "font-medium text-destructive",
                      )}
                    >
                      {formatPence(row.arrearsPence)}
                    </td>
                    <td className="p-3 text-right">
                      <LogRentButton
                        tenancyId={row.tenancyId}
                        variant="outline"
                        label="Log rent"
                        ariaLabel={`Log rent for ${row.tenantNames}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards on a phone. */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Rent by tenant">
            {rows.map((row) => (
              <li key={row.tenancyId}>
                <Card size="sm" data-testid="collection-card">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <Link
                          href={`/tenancies/${row.tenancyId}/statement`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.tenantNames}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {row.roomName}, {row.propertyLabel}
                        </span>
                      </div>
                      <StatusBadge row={row} />
                    </div>
                    <p className="text-sm">
                      Due {formatPence(row.duePence)} · paid {formatPence(row.paidPence)} · left{" "}
                      {formatPence(row.leftPence)}
                    </p>
                    {row.arrearsPence > 0 ? (
                      <p className="text-sm font-medium text-destructive">
                        {formatPence(row.arrearsPence)} overdue in total
                      </p>
                    ) : null}
                    <div>
                      <LogRentButton
                        tenancyId={row.tenancyId}
                        variant="outline"
                        label="Log rent"
                        ariaLabel={`Log rent for ${row.tenantNames}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {!propertyId && !filters.property && collection.byProperty.length > 1 ? (
        <section className="flex flex-col gap-2" aria-labelledby="by-property">
          <h2 id="by-property" className="text-lg font-semibold">
            By property
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" aria-label="Rent by property">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Property</th>
                  <th className="p-3 text-right font-medium">Due</th>
                  <th className="p-3 text-right font-medium">Collected</th>
                  <th className="p-3 text-right font-medium">Total overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {collection.byProperty.map((property) => (
                  <tr key={property.propertyId ?? "none"}>
                    <td className="p-3">
                      {property.propertyId ? (
                        <Link
                          href={`${basePath}${collectionQuery({ month: filters.month, property: property.propertyId })}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {property.propertyLabel}
                        </Link>
                      ) : (
                        property.propertyLabel
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatPence(property.duePence)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatPence(property.paidPence)}
                    </td>
                    <td
                      className={cn(
                        "p-3 text-right tabular-nums",
                        property.arrearsPence > 0 && "font-medium text-destructive",
                      )}
                    >
                      {formatPence(property.arrearsPence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Total({
  label,
  value,
  testId,
  warn,
}: {
  label: string;
  value: string;
  testId?: string;
  warn?: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={cn("text-xl font-semibold tabular-nums", warn && "text-destructive")}
          data-testid={testId}
        >
          {value}
        </dd>
      </CardContent>
    </Card>
  );
}
