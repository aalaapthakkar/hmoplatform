import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type DocumentDates = Pick<Tables["documents"]["Row"], "expiry_date" | "status">;

/** The shape the Properties page selects: each property with its rooms and documents. */
export type PropertyListRow = Pick<
  Tables["properties"]["Row"],
  | "id"
  | "address_line_1"
  | "address_line_2"
  | "town"
  | "postcode"
  | "tags"
  | "status"
  | "letting_type"
> & {
  rooms: (Pick<Tables["rooms"]["Row"], "status"> & { documents: DocumentDates[] })[];
  documents: DocumentDates[];
};

export type PropertySummary = {
  id: string;
  addressLine1: string;
  /** Second address line, town and postcode, e.g. "Headingley, Leeds LS6 3HD". */
  locality: string;
  tags: string[];
  active: boolean;
  occupancy: string;
  /** Active certificates and documents, on the property or its rooms, past their expiry date. */
  expiredDocuments: number;
};

/** A document has expired once its expiry date is before today (London). */
function isExpired(document: DocumentDates, today: string) {
  return (
    document.status === "active" && document.expiry_date !== null && document.expiry_date < today
  );
}

function occupancyLabel(lettingType: PropertyListRow["letting_type"], let_: number, total: number) {
  if (total === 0) return "No rooms yet";
  if (lettingType === "single_let") return let_ > 0 ? "Let" : "Vacant";
  return `${let_} of ${total} ${total === 1 ? "room" : "rooms"} let`;
}

/** Works out what a property card shows. `today` is "YYYY-MM-DD" in Europe/London. */
export function summariseProperty(row: PropertyListRow, today: string): PropertySummary {
  // Archived rooms are gone for good, so they count towards nothing.
  const rooms = row.rooms.filter((room) => room.status !== "archived");
  const letRooms = rooms.filter((room) => room.status === "let").length;
  const documents = [...row.documents, ...rooms.flatMap((room) => room.documents)];

  return {
    id: row.id,
    addressLine1: row.address_line_1,
    locality: [row.address_line_2, `${row.town} ${row.postcode}`].filter(Boolean).join(", "),
    tags: row.tags,
    active: row.status === "active",
    occupancy: occupancyLabel(row.letting_type, letRooms, rooms.length),
    expiredDocuments: documents.filter((document) => isExpired(document, today)).length,
  };
}

export const PROPERTY_STATUS_FILTERS = ["active", "inactive", "all"] as const;
export type PropertyStatusFilter = (typeof PROPERTY_STATUS_FILTERS)[number];

/** The Properties page filters, read from the URL. Anything unexpected falls back to the default. */
export const propertyFiltersSchema = z.object({
  tag: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((tag) => tag || undefined)
    .catch(undefined),
  status: z.enum(PROPERTY_STATUS_FILTERS).catch("active"),
});

export type PropertyFilters = { tag?: string; status: PropertyStatusFilter };

export function parsePropertyFilters(params: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return propertyFiltersSchema.parse({ tag: first(params.tag), status: first(params.status) });
}

/** The Properties page URL for a set of filters. Defaults are left out to keep it short. */
export function propertiesHref({ tag, status }: PropertyFilters) {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  if (status !== "active") params.set("status", status);
  const query = params.toString();
  return query ? `/properties?${query}` : "/properties";
}

export type PropertyGroup = {
  /** null for properties without a tag. */
  tag: string | null;
  properties: PropertySummary[];
};

/** Every tag in use, A to Z, for the tag filter. */
export function allTags(properties: PropertySummary[]): string[] {
  return [...new Set(properties.flatMap((property) => property.tags))].sort((a, b) =>
    a.localeCompare(b, "en-GB", { sensitivity: "base" }),
  );
}

/**
 * Filters properties and groups them by tag, A to Z, with untagged ones last.
 * A property with several tags appears in each of its groups.
 */
export function groupProperties(
  properties: PropertySummary[],
  filters: PropertyFilters,
): PropertyGroup[] {
  const matching = properties.filter((property) => {
    if (filters.status === "active" && !property.active) return false;
    if (filters.status === "inactive" && property.active) return false;
    return true;
  });

  const tags = filters.tag ? [filters.tag] : allTags(matching);
  const groups: PropertyGroup[] = tags
    .map((tag) => ({
      tag,
      properties: matching.filter((property) => property.tags.includes(tag)),
    }))
    .filter((group) => group.properties.length > 0);

  if (!filters.tag) {
    const untagged = matching.filter((property) => property.tags.length === 0);
    if (untagged.length > 0) groups.push({ tag: null, properties: untagged });
  }

  return groups;
}
