import { formatPence, formatUkDate } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import type { RoomFormValues } from "@/lib/validation/room";

type Tables = Database["public"]["Tables"];
type RentFrequency = Tables["rooms"]["Row"]["rent_frequency"];
type RoomStatus = Tables["rooms"]["Row"]["status"];

/** The shape the Rooms section selects: each room with its tenancies and their tenants. */
export type RoomListRow = Pick<
  Tables["rooms"]["Row"],
  "id" | "name" | "rent_pence" | "rent_frequency" | "size_sqm" | "features" | "status"
> & {
  tenancies: (Pick<Tables["tenancies"]["Row"], "id" | "start_date" | "status"> & {
    tenancy_tenants: (Pick<Tables["tenancy_tenants"]["Row"], "status"> & {
      tenants: Pick<
        Tables["tenants"]["Row"],
        "first_name" | "last_name" | "email" | "phone"
      > | null;
    })[];
  })[];
};

export type RoomTenant = { name: string; email: string | null; phone: string | null };

export type RoomSummary = {
  id: string;
  name: string;
  rent: string;
  status: RoomStatus;
  statusLabel: string;
  size: string | null;
  features: string[];
  /** The tenancy happening now, if any. */
  currentTenancy: { moveIn: string; tenants: RoomTenant[] } | null;
  /** The room as the edit form shows it. */
  formValues: RoomFormValues;
};

const FREQUENCY_LABELS: Record<RentFrequency, string> = {
  monthly: "per month",
  four_weekly: "every 4 weeks",
  fortnightly: "per fortnight",
  weekly: "per week",
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  available: "Available",
  let: "Let",
  unavailable: "Unavailable",
  archived: "Archived",
};

export function rentLabel(pence: number | null, frequency: RentFrequency) {
  return pence === null ? "Rent not set" : `${formatPence(pence)} ${FREQUENCY_LABELS[frequency]}`;
}

/** Pence as the pounds a person would type: 55000 -> "550", 55050 -> "550.50". */
export function penceToPounds(pence: number | null): string {
  if (pence === null) return "";
  const pounds = Math.trunc(pence / 100);
  const remainder = pence % 100;
  return remainder === 0 ? String(pounds) : `${pounds}.${String(remainder).padStart(2, "0")}`;
}

/** "12.50" -> "12.5", for display and editing. */
function trimSize(size: string | null) {
  if (size === null) return null;
  return size.includes(".") ? size.replace(/\.?0+$/, "") : size;
}

export function summariseRoom(row: RoomListRow): RoomSummary {
  // Active first, then a tenancy that's ending.
  const current = [...row.tenancies]
    .filter((tenancy) => tenancy.status === "active" || tenancy.status === "ending")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1))[0];

  const tenants =
    current?.tenancy_tenants
      .filter((link) => link.status === "active" && link.tenants)
      .map(({ tenants: tenant }) => ({
        name: `${tenant!.first_name} ${tenant!.last_name}`,
        email: tenant!.email,
        phone: tenant!.phone,
      })) ?? [];

  const size = trimSize(row.size_sqm);

  return {
    id: row.id,
    name: row.name,
    rent: rentLabel(row.rent_pence, row.rent_frequency),
    status: row.status,
    statusLabel: ROOM_STATUS_LABELS[row.status],
    size,
    features: row.features,
    currentTenancy: current ? { moveIn: formatUkDate(current.start_date), tenants } : null,
    formValues: {
      name: row.name,
      rent: penceToPounds(row.rent_pence),
      rentFrequency: row.rent_frequency,
      status: row.status === "archived" ? "unavailable" : row.status,
      size: size ?? "",
      features: row.features.join(", "),
    },
  };
}

/** Rooms in natural order, so "Room 10" comes after "Room 9". */
export function sortRooms<T extends { name: string }>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) =>
    a.name.localeCompare(b.name, "en-GB", { numeric: true, sensitivity: "base" }),
  );
}

/** A name for a new room: the next "Room N" after the highest one in use. */
export function nextRoomName(names: string[]): string {
  const numbers = names
    .map((name) => /^Room (\d+)$/i.exec(name.trim())?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `Room ${Math.max(0, ...numbers) + 1}`;
}
