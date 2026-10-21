import { createHash } from "node:crypto";
import type {
  owners,
  properties,
  propertyOwners,
  rooms,
  tenancies,
  tenancyTenants,
  tenants,
} from "../schema";

/**
 * Demo data: three HMOs and twelve rooms, built for any organisation.
 * Addresses are made up and have no UPRNs, so none points at a real home.
 * Emails use the reserved example.com domain and phone numbers the Ofcom
 * range set aside for drama. Ids are derived from the org id, so seeding the
 * same org again changes nothing and two orgs' demo rows never collide.
 */

export const DEMO_ORG_ID = "d3e00000-0000-4000-8000-000000000001";
export const DEMO_ORG_NAME = "Northern Rooms Ltd (demo)";

/** A stable, UUID-shaped id for one demo row in one org, e.g. demoId(org, "room", 12). */
export function demoId(orgId: string, kind: string, n: number): string {
  const hex = createHash("sha256").update(`hmo-demo/${orgId}/${kind}/${n}`).digest("hex");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Deposit capped at five weeks' rent, from monthly rent, rounded down to the penny. */
const fiveWeeksDeposit = (monthlyRentPence: number) => Math.floor((monthlyRentPence * 12 * 5) / 52);

type NewProperty = typeof properties.$inferInsert;
type NewRoom = typeof rooms.$inferInsert;
type NewTenant = typeof tenants.$inferInsert;
type NewTenancy = typeof tenancies.$inferInsert;
type NewTenancyTenant = typeof tenancyTenants.$inferInsert;
type NewOwner = typeof owners.$inferInsert;
type NewPropertyOwner = typeof propertyOwners.$inferInsert;

type PropertyKey = "manchester" | "leeds" | "nottingham";
type OwnerKey = "ellison" | "trentside";

const propertySpecs: (Omit<NewProperty, "id" | "orgId"> & { key: PropertyKey })[] = [
  {
    key: "manchester",
    addressLine1: "18 Copperfield Road",
    addressLine2: "Fallowfield",
    town: "Manchester",
    postcode: "M14 6PZ",
    council: "Manchester City Council",
    propertyType: "house",
    ownershipType: "owned",
    tags: ["licensed HMO", "students"],
  },
  {
    key: "leeds",
    addressLine1: "42 Ash Grove Terrace",
    addressLine2: "Headingley",
    town: "Leeds",
    postcode: "LS6 3HD",
    council: "Leeds City Council",
    propertyType: "house",
    ownershipType: "managed",
    tags: ["licensed HMO", "professionals"],
  },
  {
    key: "nottingham",
    addressLine1: "Flat 2, 11 Rothley Court",
    addressLine2: "Lenton",
    town: "Nottingham",
    postcode: "NG7 1QS",
    council: "Nottingham City Council",
    propertyType: "flat",
    ownershipType: "master_lease",
    headRentPence: 165_000,
    tags: ["professionals", "bills included"],
  },
];

type RoomSpec = {
  property: PropertyKey;
  name: string;
  rentPence: number;
  sizeSqm: string;
  features: string[];
  status: NewRoom["status"];
};

const roomSpecs: RoomSpec[] = [
  // Manchester: five-bed student house
  {
    property: "manchester",
    name: "Room 1 (front, ground floor)",
    rentPence: 59_500,
    sizeSqm: "14.50",
    features: ["double bed", "bay window", "desk"],
    status: "let",
  },
  {
    property: "manchester",
    name: "Room 2 (rear, ground floor)",
    rentPence: 52_500,
    sizeSqm: "10.20",
    features: ["double bed", "desk"],
    status: "let",
  },
  {
    property: "manchester",
    name: "Room 3 (front, first floor)",
    rentPence: 57_500,
    sizeSqm: "12.80",
    features: ["double bed", "en suite", "desk"],
    status: "let",
  },
  {
    property: "manchester",
    name: "Room 4 (rear, first floor)",
    rentPence: 49_500,
    sizeSqm: "8.40",
    features: ["small double bed", "desk"],
    status: "available",
  },
  {
    property: "manchester",
    name: "Room 5 (attic)",
    rentPence: 55_000,
    sizeSqm: "11.60",
    features: ["double bed", "skylight", "en suite"],
    status: "let",
  },
  // Leeds: four-bed house for professionals, managed for an owner
  {
    property: "leeds",
    name: "Room 1",
    rentPence: 62_500,
    sizeSqm: "13.10",
    features: ["king size bed", "en suite", "wardrobe"],
    status: "let",
  },
  {
    property: "leeds",
    name: "Room 2",
    rentPence: 58_000,
    sizeSqm: "11.40",
    features: ["double bed", "wardrobe"],
    status: "let",
  },
  {
    property: "leeds",
    name: "Room 3",
    rentPence: 56_500,
    sizeSqm: "10.70",
    features: ["double bed", "desk"],
    status: "available",
  },
  {
    property: "leeds",
    name: "Room 4",
    rentPence: 52_000,
    sizeSqm: "7.20",
    features: ["single bed", "desk"],
    status: "unavailable",
  },
  // Nottingham: three-bed flat on a master lease
  {
    property: "nottingham",
    name: "Bedroom A",
    rentPence: 69_500,
    sizeSqm: "12.30",
    features: ["double bed", "en suite", "balcony"],
    status: "let",
  },
  {
    property: "nottingham",
    name: "Bedroom B",
    rentPence: 64_500,
    sizeSqm: "11.00",
    features: ["double bed", "wardrobe"],
    status: "let",
  },
  {
    property: "nottingham",
    name: "Bedroom C",
    rentPence: 59_500,
    sizeSqm: "9.10",
    features: ["double bed", "desk"],
    status: "available",
  },
];

const tenantNames: [string, string][] = [
  ["Priya", "Shah"],
  ["Tom", "Walsh"],
  ["Aisha", "Okafor"],
  ["Callum", "Reid"],
  ["Sophie", "Turner"],
  ["Daniel", "Kowalski"],
  ["Hannah", "Lewis"],
  ["Marcus", "Bennett"],
];

const ownerSpecs: (Omit<NewOwner, "id" | "orgId"> & { key: OwnerKey })[] = [
  {
    key: "ellison",
    name: "Margaret Ellison",
    email: "margaret.ellison@example.com",
    phone: "07700 900201",
  },
  {
    key: "trentside",
    name: "Trentside Estates Ltd",
    email: "lettings@trentside.example.com",
    phone: "0115 496 0123",
  },
];

const propertyOwnerSpecs: { property: PropertyKey; owner: OwnerKey }[] = [
  { property: "leeds", owner: "ellison" },
  { property: "nottingham", owner: "trentside" },
];

export type DemoData = {
  properties: NewProperty[];
  rooms: NewRoom[];
  tenants: NewTenant[];
  tenancies: NewTenancy[];
  tenancyTenants: NewTenancyTenant[];
  owners: NewOwner[];
  propertyOwners: NewPropertyOwner[];
};

/** All the demo rows for one organisation. */
export function buildDemoData(orgId: string): DemoData {
  const propertyId = (key: PropertyKey) =>
    demoId(orgId, "property", propertySpecs.findIndex((p) => p.key === key) + 1);
  const ownerId = (key: OwnerKey) =>
    demoId(orgId, "owner", ownerSpecs.findIndex((o) => o.key === key) + 1);

  const properties: NewProperty[] = propertySpecs.map(({ key, ...property }) => ({
    ...property,
    id: propertyId(key),
    orgId,
  }));

  const rooms: NewRoom[] = roomSpecs.map((room, index) => ({
    id: demoId(orgId, "room", index + 1),
    orgId,
    propertyId: propertyId(room.property),
    name: room.name,
    rentPence: room.rentPence,
    rentFrequency: "monthly",
    sizeSqm: room.sizeSqm,
    features: room.features,
    status: room.status,
  }));

  const tenants: NewTenant[] = tenantNames.map(([firstName, lastName], index) => ({
    id: demoId(orgId, "tenant", index + 1),
    orgId,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@example.com`.toLowerCase(),
    phone: `07700 900${String(101 + index)}`,
  }));

  // All periodic (Renters' Rights Act, from 1 May 2026): the Manchester students moved in
  // for the academic year, the others in the spring.
  const tenancies: NewTenancy[] = roomSpecs
    .map((room, index) => ({ ...room, id: rooms[index]!.id! }))
    .filter((room) => room.status === "let")
    .map((room, index) => {
      const student = room.property === "manchester";
      return {
        id: demoId(orgId, "tenancy", index + 1),
        orgId,
        roomId: room.id,
        startDate: student ? "2026-09-01" : "2026-04-15",
        status: "active",
        rentPence: room.rentPence,
        rentFrequency: "monthly",
        rentDueDay: student ? 1 : 15,
        depositPence: fiveWeeksDeposit(room.rentPence),
      };
    });

  const tenancyTenants: NewTenancyTenant[] = tenancies.map((tenancy, index) => ({
    id: demoId(orgId, "tenancy-tenant", index + 1),
    orgId,
    tenancyId: tenancy.id!,
    tenantId: tenants[index]!.id!,
  }));

  const owners: NewOwner[] = ownerSpecs.map(({ key, ...owner }) => ({
    ...owner,
    id: ownerId(key),
    orgId,
  }));

  const propertyOwners: NewPropertyOwner[] = propertyOwnerSpecs.map((link, index) => ({
    id: demoId(orgId, "property-owner", index + 1),
    orgId,
    propertyId: propertyId(link.property),
    ownerId: ownerId(link.owner),
  }));

  return { properties, rooms, tenants, tenancies, tenancyTenants, owners, propertyOwners };
}
