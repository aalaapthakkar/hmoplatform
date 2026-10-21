import { DoorOpen, House } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PropertySummary } from "@/lib/properties/summary";

export function PropertyCard({ property }: { property: PropertySummary }) {
  const overdue = property.expiredDocuments;

  return (
    <Card
      className="relative pt-0 transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/30"
      data-testid="property-card"
    >
      {/* Placeholder until photos can be uploaded. */}
      <div
        aria-hidden
        className="flex aspect-[16/9] items-center justify-center bg-muted text-muted-foreground/60"
      >
        <House className="size-10" strokeWidth={1.5} />
      </div>

      <CardHeader>
        <CardTitle>
          {/* The whole card is clickable through this link's overlay. */}
          <Link
            href={`/properties/${property.id}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {property.addressLine1}
          </Link>
        </CardTitle>
        <CardDescription>{property.locality}</CardDescription>
        {overdue > 0 ? (
          <CardAction>
            <Badge
              className="bg-destructive text-white"
              title={`${overdue} ${overdue === 1 ? "certificate has" : "certificates have"} expired`}
            >
              {overdue} overdue
              <span className="sr-only">: expired certificates</span>
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-muted-foreground">
          <DoorOpen className="size-4" aria-hidden />
          {property.occupancy}
        </p>
        {property.active ? null : <Badge variant="outline">Inactive</Badge>}
      </CardContent>
    </Card>
  );
}
