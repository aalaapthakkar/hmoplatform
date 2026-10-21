import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomsSection } from "@/components/properties/rooms-section";
import { SectionFallback } from "@/components/properties/section-heading";
import { getProperty } from "@/lib/properties/queries";
import { nextRoomName, type RoomListRow, sortRooms, summariseRoom } from "@/lib/properties/rooms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rooms" };

/** The property hub's home: its rooms. */
export default function RoomsPage({ params }: PageProps<"/properties/[propertyId]">) {
  return (
    <Suspense fallback={<SectionFallback />}>
      <Rooms params={params} />
    </Suspense>
  );
}

const ROOM_COLUMNS = `
  id, name, rent_pence, rent_frequency, size_sqm, features, status,
  tenancies (id, start_date, status,
    tenancy_tenants (status, tenants (first_name, last_name, email, phone)))
`;

async function Rooms({ params }: Pick<PageProps<"/properties/[propertyId]">, "params">) {
  const { propertyId } = await params;
  // Checks the property is in the user's organisation, or shows a 404.
  await getProperty(propertyId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("property_id", propertyId)
    .overrideTypes<RoomListRow[], { merge: false }>();
  if (error) throw new Error("Could not load rooms", { cause: error.code });

  const rooms = sortRooms(data).map(summariseRoom);

  return (
    <RoomsSection
      propertyId={propertyId}
      rooms={rooms.filter((room) => room.status !== "archived")}
      archivedRooms={rooms.filter((room) => room.status === "archived")}
      nextRoomName={nextRoomName(rooms.map((room) => room.name))}
    />
  );
}
