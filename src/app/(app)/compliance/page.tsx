import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ComplianceFiltersBar } from "@/components/compliance/compliance-filters";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/session";
import {
  buildGrid,
  complianceQuery,
  listItems,
  parseComplianceFilters,
  RAGS,
} from "@/lib/compliance/dashboard";
import { getComplianceOverview } from "@/lib/compliance/queries";
import {
  COMPLIANCE_STATUS_LABELS,
  type ComplianceItem,
  daysLeftLabel,
  RAG_CLASSES,
  RAG_LABELS,
  ragCounts,
  ragOf,
} from "@/lib/compliance/status";
import { formatUkDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Compliance" };

export default function CompliancePage({ searchParams }: PageProps<"/compliance">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <p className="text-muted-foreground">
          Every certificate, check and licence across your properties.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function shortDate(date: string | null) {
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}` : null;
}

async function Overview({ searchParams }: Pick<PageProps<"/compliance">, "searchParams">) {
  const [membership, params] = await Promise.all([requireMembership(), searchParams]);
  const filters = parseComplianceFilters(params);
  const { items, propertyLabels } = await getComplianceOverview(membership.orgId);
  const scope = filters.property ? items.filter((i) => i.property_id === filters.property) : items;
  const counts = ragCounts(scope);
  const properties = [...propertyLabels.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }));

  if (properties.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Add a property to start tracking its compliance.
      </p>
    );
  }

  const grid = buildGrid(items, propertyLabels, filters);
  const list = listItems(items, filters);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="compliance-totals">
        {RAGS.map((rag) => (
          <Link
            key={rag}
            href={`/compliance${complianceQuery({ ...filters, rag })}`}
            className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{RAG_LABELS[rag]}</dt>
                  <dd className="text-2xl font-semibold tabular-nums" data-testid={`total-${rag}`}>
                    {counts[rag]}
                  </dd>
                </div>
                <span aria-hidden className={cn("size-4 rounded-full", RAG_CLASSES[rag])} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </dl>

      <ComplianceFiltersBar filters={filters} properties={properties} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="compliance-count">
          {list.length} {list.length === 1 ? "item" : "items"} match
        </p>
        <a
          href={`/compliance/export${complianceQuery({ ...filters, view: "grid" })}`}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          <Download aria-hidden />
          Download CSV
        </a>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing matches these filters.
        </p>
      ) : (
        <>
          {filters.view === "grid" ? (
            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <table className="text-sm" aria-label="Compliance by property">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-56 bg-muted p-3 font-medium">
                      Property
                    </th>
                    {grid.columns.map((column) => (
                      <th
                        key={column.serviceTypeId}
                        className="min-w-24 p-2 align-bottom text-xs font-medium"
                      >
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {grid.rows.map((row) => (
                    <tr key={row.propertyId} data-testid="compliance-row">
                      <th className="sticky left-0 z-10 bg-background p-3 text-left font-medium">
                        <Link
                          href={`/properties/${row.propertyId}/compliance`}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.label}
                        </Link>
                      </th>
                      {grid.columns.map((column) => {
                        const cell = row.cells[column.serviceTypeId];
                        return (
                          <td key={column.serviceTypeId} className="p-1">
                            {cell ? <GridCell item={cell.item} faded={!cell.matches} /> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <ul
            className={cn("flex flex-col gap-2", filters.view === "grid" && "md:hidden")}
            aria-label="Compliance items"
          >
            {list.map((item) => (
              <li key={`${item.property_id}-${item.service_type_id}`}>
                <Link
                  href={`/properties/${item.property_id}/compliance`}
                  className="flex items-start justify-between gap-3 rounded-xl border p-3 text-sm hover:bg-muted/50"
                  data-testid="compliance-list-item"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{item.service_name}</span>
                    <span className="truncate text-muted-foreground">
                      {propertyLabels.get(item.property_id)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.not_required
                        ? `Not needed: ${item.not_required_reason}`
                        : item.expires_on
                          ? `${item.expiry_label} ${formatUkDate(item.expires_on)} · ${daysLeftLabel(item.days_left)}`
                          : "Not recorded yet"}
                    </span>
                  </span>
                  <Badge className={RAG_CLASSES[ragOf(item.status)]}>
                    {COMPLIANCE_STATUS_LABELS[item.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function GridCell({ item, faded }: { item: ComplianceItem; faded: boolean }) {
  const label = COMPLIANCE_STATUS_LABELS[item.status];
  const when = item.expires_on ? formatUkDate(item.expires_on) : null;
  return (
    <Link
      href={`/properties/${item.property_id}/compliance`}
      title={`${item.service_name}: ${label}${when ? `, ${item.expiry_label.toLowerCase()} ${when}` : ""}`}
      className={cn(
        "flex h-12 flex-col items-center justify-center rounded-md px-1 text-center text-xs leading-tight",
        RAG_CLASSES[ragOf(item.status)],
        faded && "opacity-25",
      )}
      data-testid="compliance-cell"
      data-status={item.status}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{shortDate(item.expires_on)}</span>
      <span className="sr-only">
        {item.service_name}
        {when ? `, ${when}` : ""}
      </span>
    </Link>
  );
}
