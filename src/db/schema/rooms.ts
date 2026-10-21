import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { rentFrequency } from "./_enums";
import { orgId } from "./_org";
import { timestamps } from "./_shared";
import { properties } from "./properties";

/** "unavailable" is temporary (e.g. being redecorated); "archived" is gone for good. */
export const roomStatus = pgEnum("room_status", ["available", "let", "unavailable", "archived"]);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull(),
    name: text("name").notNull(),
    /** Null until the rent is set, e.g. for rooms created by the Add property wizard. */
    rentPence: integer("rent_pence"),
    rentFrequency: rentFrequency("rent_frequency").notNull().default("monthly"),
    /** Floor area in square metres. Exact decimal, returned as a string. */
    sizeSqm: numeric("size_sqm", { precision: 6, scale: 2 }),
    features: text("features")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: roomStatus("status").notNull().default("available"),
    ...timestamps,
  },
  (table) => [
    unique("rooms_id_org_id_key").on(table.id, table.orgId),
    index("rooms_org_id_idx").on(table.orgId),
    index("rooms_property_id_idx").on(table.propertyId),
    // Includes org_id so a room can only belong to a property in the same org.
    foreignKey({
      name: "rooms_property_fk",
      columns: [table.propertyId, table.orgId],
      foreignColumns: [properties.id, properties.orgId],
    }).onDelete("restrict"),
    check("rooms_rent_pence_not_negative", sql`rent_pence >= 0`),
    check("rooms_size_sqm_positive", sql`size_sqm > 0`),
  ],
).enableRLS();

export type Room = typeof rooms.$inferSelect;
export type RoomStatus = (typeof roomStatus.enumValues)[number];
