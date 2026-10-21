import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionFallback } from "@/components/properties/section-heading";
import { requireMembership } from "@/lib/auth/session";
import { type ActivityNames, describeActivity } from "@/lib/properties/activity";
import { getProperty } from "@/lib/properties/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity" };

const LIMIT = 100;

export default function ActivityPage({ params }: PageProps<"/properties/[propertyId]/activity">) {
  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="activity-heading" className="text-xl font-semibold">
          Activity
        </h2>
        <p className="text-sm text-muted-foreground">
          Every change to this property, its rooms, owner and documents, newest first.
        </p>
      </div>
      <Suspense fallback={<SectionFallback />}>
        <Activity params={params} />
      </Suspense>
    </section>
  );
}

async function Activity({
  params,
}: Pick<PageProps<"/properties/[propertyId]/activity">, "params">) {
  const { propertyId } = await params;
  const [membership] = await Promise.all([requireMembership(), getProperty(propertyId)]);

  // The audit log's own rules only show it to admins; say so rather than look empty.
  if (membership.role !== "admin") {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        The activity history is only available to admins in your organisation.
      </p>
    );
  }

  const supabase = await createClient();
  const [activity, rooms, owners] = await Promise.all([
    supabase.rpc("property_activity", { p_property_id: propertyId, p_limit: LIMIT }),
    supabase.from("rooms").select("id, name, tenancies (id)").eq("property_id", propertyId),
    supabase.from("owners").select("id, name").eq("org_id", membership.orgId),
  ]);
  if (activity.error || rooms.error || owners.error) {
    throw new Error("Could not load the activity", {
      cause: activity.error?.code ?? rooms.error?.code ?? owners.error?.code,
    });
  }

  const names: ActivityNames = {
    rooms: new Map(rooms.data.map((room) => [room.id, room.name])),
    owners: new Map(owners.data.map((owner) => [owner.id, owner.name])),
    tenancyRooms: new Map(
      rooms.data.flatMap((room) => room.tenancies.map((tenancy) => [tenancy.id, room.id] as const)),
    ),
  };
  const entries = activity.data.map((row) => describeActivity(row, names));

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>;
  }

  return (
    <>
      <ol className="flex flex-col" aria-label="Changes">
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-testid="activity-entry"
            className="flex flex-col gap-1 border-l-2 py-3 pl-4"
          >
            <p>
              <span className="font-medium">{entry.subject}</span>
              <span className="text-muted-foreground"> · {entry.summary}</span>
            </p>
            {entry.changes.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-sm">
                {entry.changes.map((change) => (
                  <li key={change.label}>
                    {change.label}
                    {change.from === null && change.to === null
                      ? " changed"
                      : `: ${change.from ?? "none"} → ${change.to ?? "none"}`}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {entry.who} · {entry.when}
            </p>
          </li>
        ))}
      </ol>
      {entries.length === LIMIT ? (
        <p className="text-xs text-muted-foreground">Showing the latest {LIMIT} changes.</p>
      ) : null}
    </>
  );
}
