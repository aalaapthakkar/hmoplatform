import { formatPence, formatUkDate, formatUkDateTime } from "@/lib/format";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/validation/document";
import { END_REASON_LABELS } from "@/lib/validation/tenancy";
import { ROOM_STATUS_LABELS } from "./rooms";

export type ActivityRow = Database["public"]["Functions"]["property_activity"]["Returns"][number];

/** Names the activity log can't read from the row itself, looked up by id. */
export type ActivityNames = {
  rooms: Map<string, string>;
  owners: Map<string, string>;
  /** Tenancy id to room id. */
  tenancyRooms: Map<string, string>;
};

export type ActivityChange = { label: string; from: string | null; to: string | null };

export type ActivityEntry = {
  id: string;
  /** What changed, e.g. "Room 3" or "Property". */
  subject: string;
  /** A short sentence, e.g. "Rent changed" or "Room added". */
  summary: string;
  changes: ActivityChange[];
  who: string;
  when: string;
};

type Values = Record<string, Json | undefined>;

const IGNORED = new Set(["id", "org_id", "created_at", "updated_at", "uploaded_by"]);

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  rent_pence: "Rent",
  rent_frequency: "Rent frequency",
  size_sqm: "Size",
  features: "Features",
  status: "Status",
  address_line_1: "Address line 1",
  address_line_2: "Address line 2",
  town: "Town",
  postcode: "Postcode",
  council: "Council",
  uprn: "UPRN",
  property_type: "Property type",
  letting_type: "Rental type",
  bedrooms: "Bedrooms",
  ownership_type: "How you hold it",
  head_rent_pence: "Head rent",
  tags: "Tags",
  description: "Description",
  amenities: "Amenities",
  house_rules: "House rules",
  bills_included: "Bills included",
  document_type: "Type",
  file_name: "File",
  expiry_date: "Expiry date",
  start_date: "Start date",
  end_date: "End date",
  notice_date: "Notice date",
  end_reason: "How it's ending",
  rent_due_day: "Rent due day",
  deposit_pence: "Deposit",
  owner_id: "Owner",
  room_id: "Room",
};

/** Long text is described as changed, without repeating it. */
const LONG_TEXT = new Set(["description", "house_rules"]);

const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: {
    ...ROOM_STATUS_LABELS,
    active: "Active",
    removed: "Removed",
    prospective: "Prospective",
    ending: "Notice given",
    ended: "Ended",
    cancelled: "Cancelled",
  },
  end_reason: END_REASON_LABELS,
  ownership_type: { owned: "Owned", managed: "Managed for an owner", master_lease: "Master lease" },
  letting_type: { house_share: "House share", single_let: "Single let" },
  rent_frequency: {
    monthly: "Per month",
    four_weekly: "Every 4 weeks",
    fortnightly: "Per fortnight",
    weekly: "Per week",
  },
  document_type: DOCUMENT_TYPE_LABELS,
};

function asText(field: string, value: Json | undefined, names: ActivityNames): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field.endsWith("_pence") && typeof value === "number") return formatPence(value);
  if (field.endsWith("_date") && typeof value === "string") return formatUkDate(value);
  if (field === "size_sqm") {
    const size = String(value);
    return `${size.includes(".") ? size.replace(/\.?0+$/, "") : size} m²`;
  }
  if (field === "owner_id" && typeof value === "string") return names.owners.get(value) ?? null;
  if (field === "room_id" && typeof value === "string") return names.rooms.get(value) ?? null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : null;
  if (typeof value === "string") return VALUE_LABELS[field]?.[value] ?? value;
  return String(value);
}

/** The fields that differ between before and after, in plain words. */
export function describeChanges(
  before: Values,
  after: Values,
  names: ActivityNames,
): ActivityChange[] {
  return Object.keys(after)
    .filter((field) => !IGNORED.has(field))
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({
      label: FIELD_LABELS[field] ?? field.replace(/_/g, " "),
      from: LONG_TEXT.has(field) ? null : asText(field, before[field], names),
      to: LONG_TEXT.has(field) ? null : asText(field, after[field], names),
    }));
}

function values(json: Json | null): Values {
  return json && typeof json === "object" && !Array.isArray(json) ? json : {};
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** Turns one audit row into a line for the Activity section. */
export function describeActivity(row: ActivityRow, names: ActivityNames): ActivityEntry {
  const before = values(row.before);
  const after = values(row.after);
  const current = row.action === "delete" ? before : after;
  const who = row.actor_name ?? "The system";
  const when = formatUkDateTime(row.created_at);
  const base = { id: row.id, who, when, changes: [] as ActivityChange[] };
  const changes = row.action === "update" ? describeChanges(before, after, names) : [];
  const statusChanged = changes.find((change) => change.label === "Status");
  const onlyStatus = statusChanged && changes.length === 1;

  switch (row.table_name) {
    case "properties": {
      if (row.action === "insert")
        return { ...base, subject: "Property", summary: "Property added" };
      return { ...base, subject: "Property", summary: "Property updated", changes };
    }
    case "rooms": {
      const subject = text(current.name) ?? "A room";
      if (row.action === "insert") return { ...base, subject, summary: "Room added" };
      if (onlyStatus && after.status === "archived") {
        return { ...base, subject, summary: "Room archived" };
      }
      return { ...base, subject, summary: "Room updated", changes };
    }
    case "documents": {
      const type = text(current.document_type);
      const subject =
        (type && DOCUMENT_TYPE_LABELS[type as keyof typeof DOCUMENT_TYPE_LABELS]) ?? "Document";
      const file = text(current.file_name);
      if (row.action === "insert") {
        return { ...base, subject, summary: file ? `Uploaded ${file}` : "Uploaded" };
      }
      if (onlyStatus && after.status === "archived") {
        return { ...base, subject, summary: file ? `Archived ${file}` : "Archived" };
      }
      return { ...base, subject, summary: "Document updated", changes };
    }
    case "property_owners": {
      const ownerId = text(current.owner_id);
      const subject = (ownerId && names.owners.get(ownerId)) ?? "An owner";
      if (row.action === "insert" || (onlyStatus && after.status === "active")) {
        return { ...base, subject, summary: "Linked as owner" };
      }
      if (onlyStatus && after.status === "removed") {
        return { ...base, subject, summary: "No longer the owner" };
      }
      return { ...base, subject, summary: "Owner link updated", changes };
    }
    case "tenancies": {
      const roomId = text(current.room_id);
      const subject = `Tenancy${roomId && names.rooms.has(roomId) ? ` in ${names.rooms.get(roomId)}` : ""}`;
      if (row.action === "insert") return { ...base, subject, summary: "Tenancy created" };
      const moves: Record<string, string> = {
        ending: "Notice recorded",
        ended: "Tenancy ended",
        active: "Moved in",
        cancelled: "Cancelled",
      };
      const move = before.status !== after.status ? moves[text(after.status) ?? ""] : undefined;
      // The status itself is in the summary; keep the other changes (such as the dates).
      const details = move ? changes.filter((change) => change.label !== "Status") : changes;
      return { ...base, subject, summary: move ?? "Tenancy updated", changes: details };
    }
    case "tenancy_tenants": {
      const tenancyId = text(current.tenancy_id);
      const roomId = tenancyId ? names.tenancyRooms.get(tenancyId) : undefined;
      const subject = `Tenancy${roomId && names.rooms.has(roomId) ? ` in ${names.rooms.get(roomId)}` : ""}`;
      if (row.action === "insert") return { ...base, subject, summary: "Tenant added" };
      if (onlyStatus && after.status === "removed") {
        return { ...base, subject, summary: "Tenant removed" };
      }
      return { ...base, subject, summary: "Tenant updated", changes };
    }
    default:
      return { ...base, subject: row.table_name, summary: `Record ${row.action}d`, changes };
  }
}
