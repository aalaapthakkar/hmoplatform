import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatUkDate } from "@/lib/format";
import type { Repair } from "@/lib/maintenance/queries";
import { MAINTENANCE_STATUS_LABELS, URGENCY_LABELS } from "@/lib/validation/maintenance";
import { cn } from "@/lib/utils";

/** A repair with its details and photos. Staff pass a place and status controls. */
export function RepairCard({
  repair,
  place,
  children,
}: {
  repair: Repair;
  place?: string;
  children?: ReactNode;
}) {
  const open = repair.status === "reported" || repair.status === "in_progress";
  return (
    <Card data-testid="repair">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <h2 className="font-semibold break-words">{repair.title}</h2>
            <span className="text-xs text-muted-foreground">
              Reported {formatUkDate(repair.created_at)}
              {place ? ` · ${place}` : ""}
              {repair.location ? ` · ${repair.location}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {open && (repair.urgency === "urgent" || repair.urgency === "emergency") ? (
              <Badge variant="destructive">{URGENCY_LABELS[repair.urgency]}</Badge>
            ) : null}
            <Badge variant={open ? "default" : "secondary"} data-testid="repair-status">
              {MAINTENANCE_STATUS_LABELS[repair.status]}
            </Badge>
          </div>
        </div>
        <p className="text-sm whitespace-pre-line">{repair.description}</p>
        {repair.photos.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Photos">
            {repair.photos.map((photo) => (
              <li key={photo.id}>
                {photo.url ? (
                  <a href={photo.url} target="_blank" rel="noreferrer" className="block">
                    {/* Short-lived private links, so Next's image optimiser can't cache them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={`Photo: ${photo.fileName}`}
                      className={cn("size-20 rounded-lg border bg-muted object-cover")}
                    />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{photo.fileName}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {repair.resolved_at ? (
          <p className="text-xs text-muted-foreground">Fixed {formatUkDate(repair.resolved_at)}</p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
