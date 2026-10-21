import { z } from "zod";
import { optionalPoundsField, parseTags } from "./property";

/** Statuses a person can choose. "archived" is set by the Archive button only. */
export const EDITABLE_ROOM_STATUSES = ["available", "let", "unavailable"] as const;
export const RENT_FREQUENCIES = ["monthly", "four_weekly", "fortnightly", "weekly"] as const;

export type RoomFormValues = {
  name: string;
  rent: string;
  rentFrequency: string;
  status: string;
  size: string;
  features: string;
};

export const roomSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for the room").max(60, "Use 60 characters or fewer"),
  rent: optionalPoundsField,
  rentFrequency: z.enum(RENT_FREQUENCIES, "Choose how often the rent is due"),
  status: z.enum(EDITABLE_ROOM_STATUSES, "Choose the room's status"),
  size: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (/^\d{1,4}(\.\d{1,2})?$/.test(value) && Number(value) > 0),
      "Enter the size in square metres, like 12 or 12.5",
    )
    // numeric(6,2) in Postgres: kept as a string so it stays exact.
    .transform((value) => value || null),
  features: z
    .string()
    .transform(parseTags)
    .refine((features) => features.length <= 20, "Use 20 features or fewer")
    .refine(
      (features) => features.every((feature) => feature.length <= 40),
      "Keep each feature to 40 characters or fewer",
    ),
});

export type RoomInput = z.infer<typeof roomSchema>;

/** The columns to write for a room. */
export function toRoomRow(room: RoomInput) {
  return {
    name: room.name,
    rent_pence: room.rent,
    rent_frequency: room.rentFrequency,
    status: room.status,
    size_sqm: room.size,
    features: room.features,
  };
}
