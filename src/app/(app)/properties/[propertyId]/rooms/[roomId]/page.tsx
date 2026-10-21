import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { SectionFallback } from "@/components/properties/section-heading";
import { RoomTenancies } from "@/components/tenancies/room-tenancies";
import { todayInLondon } from "@/lib/format";
import { getProperty } from "@/lib/properties/queries";
import { penceToPounds, rentLabel, ROOM_STATUS_LABELS } from "@/lib/properties/rooms";
import { defaultTenancyId, hasSpaceForTenancy } from "@/lib/tenancies/status";
import { summariseTenancy, type TenancyRow } from "@/lib/tenancies/summary";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Room" };

type Props = PageProps<"/properties/[propertyId]/rooms/[roomId]">;

export default function RoomPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Room params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type RoomRow = Pick<
  Database["public"]["Tables"]["rooms"]["Row"],
  "id" | "name" | "status" | "rent_pence" | "rent_frequency"
> & { tenancies: TenancyRow[] };

const ROOM_COLUMNS = `
  id, name, status, rent_pence, rent_frequency,
  tenancies (id, status, start_date, end_date, notice_date, end_reason,
    rent_pence, rent_frequency, rent_due_day, deposit_pence,
    tenancy_tenants (status, tenants (first_name, last_name, email, phone)))
`;

async function Room({ params, searchParams }: Props) {
  const [{ propertyId, roomId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(roomId).success) notFound();
  await getProperty(propertyId);

  const supabase = await createClient();
  const { data: room, error } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("id", roomId)
    .eq("property_id", propertyId)
    .maybeSingle()
    .overrideTypes<RoomRow, { merge: false }>();
  if (error) throw new Error("Could not load the room", { cause: error.code });
  if (!room) notFound();

  const today = todayInLondon();
  const tenancies = room.tenancies
    .map((row) => summariseTenancy(row, today))
    // Upcoming first, then current, then past ones newest first.
    .sort((a, b) => {
      const order = { upcoming: 0, current: 1, past: 2 } as const;
      return order[a.group] - order[b.group] || (a.dates.startDate < b.dates.startDate ? 1 : -1);
    });
  const dates = tenancies.map((tenancy) => tenancy.dates);
  const requested = typeof query.tenancy === "string" ? query.tenancy : null;
  const selectedId = tenancies.some((tenancy) => tenancy.id === requested)
    ? requested
    : defaultTenancyId(dates);

  return (
    <RoomTenancies
      propertyId={propertyId}
      room={{
        id: room.id,
        name: room.name,
        statusLabel: ROOM_STATUS_LABELS[room.status],
        archived: room.status === "archived",
        rent: rentLabel(room.rent_pence, room.rent_frequency),
        rentPounds: penceToPounds(room.rent_pence),
        rentFrequency: room.rent_frequency === "weekly" ? "weekly" : "monthly",
      }}
      tenancies={tenancies}
      selectedId={selectedId}
      canAdd={room.status !== "archived" && hasSpaceForTenancy(dates)}
      today={today}
    />
  );
}
