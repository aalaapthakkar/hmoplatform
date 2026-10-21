import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { recordStatus } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";

export const propertyType = pgEnum("property_type", [
  "house",
  "flat",
  "maisonette",
  "bungalow",
  "other",
]);

export const ownershipType = pgEnum("ownership_type", ["owned", "managed", "master_lease"]);

/** Let room by room to separate tenants, or as a whole to one household. */
export const lettingType = pgEnum("letting_type", ["house_share", "single_let"]);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    addressLine1: text("address_line_1").notNull(),
    addressLine2: text("address_line_2"),
    town: text("town").notNull(),
    /** Upper case with a single space, e.g. "M14 5RQ". */
    postcode: text("postcode").notNull(),
    /** Unique Property Reference Number: up to 12 digits. */
    uprn: text("uprn"),
    /** Local housing authority, e.g. "Leeds City Council". */
    council: text("council"),
    propertyType: propertyType("property_type").notNull().default("house"),
    lettingType: lettingType("letting_type").notNull().default("house_share"),
    bedrooms: smallint("bedrooms"),
    ownershipType: ownershipType("ownership_type").notNull(),
    /** Rent the org pays the landlord on a master lease, per month, in pence. */
    headRentPence: integer("head_rent_pence"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Free text for adverts and the team, e.g. the layout and the area. */
    description: text("description"),
    /** Shared facilities, e.g. "Wi-Fi", "washing machine". */
    amenities: text("amenities")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    houseRules: text("house_rules"),
    billsIncluded: boolean("bills_included").notNull().default(false),
    /** Shown to tenants in their portal: bins, Wi-Fi, who to call. Simple formatting. */
    welcomePack: text("welcome_pack"),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    unique("properties_id_org_id_key").on(table.id, table.orgId),
    index("properties_org_id_idx").on(table.orgId),
    check("properties_postcode_format", sql`postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'`),
    check("properties_uprn_format", sql`uprn ~ '^[0-9]{1,12}$'`),
    check("properties_head_rent_pence_not_negative", sql`head_rent_pence >= 0`),
    check(
      "properties_master_lease_has_head_rent",
      sql`ownership_type <> 'master_lease' or head_rent_pence is not null`,
    ),
    check("properties_bedrooms_range", sql`bedrooms between 1 and 50`),
    check("properties_description_length", sql`char_length(description) <= 5000`),
    check("properties_house_rules_length", sql`char_length(house_rules) <= 5000`),
    check("properties_welcome_pack_length", sql`char_length(welcome_pack) <= 20000`),
  ],
).enableRLS();

export type Property = typeof properties.$inferSelect;
export type OwnershipType = (typeof ownershipType.enumValues)[number];
export type LettingType = (typeof lettingType.enumValues)[number];
