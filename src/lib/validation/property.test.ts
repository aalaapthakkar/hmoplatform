import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  addressStepSchema,
  isValidPostcode,
  newPropertySchema,
  normalisePostcode,
  parseTags,
  poundsToPence,
  type PropertyWizardValues,
  relationshipStepSchema,
  rentalStepSchema,
  toCreatePropertyArgs,
} from "./property";

const OWNER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const values = (overrides: Partial<PropertyWizardValues> = {}): PropertyWizardValues => ({
  postcode: "ls6 3hd",
  addressLine1: "42 Ash Grove Terrace",
  addressLine2: "",
  town: "Leeds",
  council: "Leeds",
  propertyType: "house",
  lettingType: "house_share",
  roomCount: "6",
  roomRent: "",
  ownershipType: "owned",
  headRent: "",
  ownerMode: "existing",
  ownerId: "",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  tags: "",
  ...overrides,
});

const errors = (schema: z.ZodType, input: unknown): Record<string, string[] | undefined> => {
  const result = schema.safeParse(input);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};

describe("postcodes", () => {
  it("normalises spacing and case", () => {
    expect(normalisePostcode(" m146pz ")).toBe("M14 6PZ");
    expect(normalisePostcode("sw1a   1aa")).toBe("SW1A 1AA");
  });

  it("accepts full UK postcodes only", () => {
    expect(isValidPostcode("NG7 1QS")).toBe(true);
    expect(isValidPostcode("ec1a1bb")).toBe(true);
    expect(isValidPostcode("NG7")).toBe(false);
    expect(isValidPostcode("12345")).toBe(false);
  });
});

describe("poundsToPence", () => {
  it.each([
    ["550", 55_000],
    ["550.5", 55_050],
    ["550.50", 55_050],
    ["£1,250.99", 125_099],
    ["0", 0],
    [" 0.07 ", 7],
  ])("turns %s into %i pence", (input, pence) => {
    expect(poundsToPence(input)).toBe(pence);
  });

  it.each(["", "abc", "-5", "1.999", "1.2.3", "£", "99999999"])("rejects %j", (input) => {
    expect(poundsToPence(input)).toBeNull();
  });
});

describe("parseTags", () => {
  it("trims, drops empties and removes duplicates, keeping the first spelling", () => {
    expect(parseTags(" students,Licensed  HMO, , STUDENTS")).toEqual(["students", "Licensed HMO"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("address step", () => {
  it("normalises the postcode and empties optional fields to null", () => {
    expect(addressStepSchema.parse(values())).toMatchObject({
      postcode: "LS6 3HD",
      addressLine2: null,
      council: "Leeds",
    });
  });

  it("explains what is missing", () => {
    expect(
      errors(addressStepSchema, values({ postcode: "", addressLine1: " ", town: "" })),
    ).toEqual({
      postcode: ["Enter the postcode"],
      addressLine1: ["Enter the first line of the address"],
      town: ["Enter the town or city"],
    });
    expect(errors(addressStepSchema, values({ postcode: "LS6" }))).toEqual({
      postcode: ["Enter a full UK postcode, like M14 6PZ"],
    });
  });
});

describe("rental step", () => {
  it("reads the room count and optional rent", () => {
    expect(rentalStepSchema.parse(values({ roomRent: "575" }))).toEqual({
      lettingType: "house_share",
      roomCount: 6,
      roomRent: 57_500,
    });
    expect(rentalStepSchema.parse(values()).roomRent).toBeNull();
  });

  it.each(["0", "51", "2.5", "six", ""])("rejects %j rooms", (roomCount) => {
    expect(errors(rentalStepSchema, values({ roomCount })).roomCount).toHaveLength(1);
  });
});

describe("relationship step", () => {
  it("needs no owner for a property you own", () => {
    expect(relationshipStepSchema.parse(values({ tags: "students" }))).toEqual({
      ownershipType: "owned",
      tags: ["students"],
    });
  });

  it("needs an owner for a managed property", () => {
    expect(errors(relationshipStepSchema, values({ ownershipType: "managed" }))).toEqual({
      ownerId: ["Choose an owner"],
    });
    expect(
      errors(relationshipStepSchema, values({ ownershipType: "managed", ownerMode: "new" })),
    ).toEqual({ ownerName: ["Enter the owner's name"] });
    expect(
      relationshipStepSchema.parse(
        values({
          ownershipType: "managed",
          ownerMode: "new",
          ownerName: "Jean Hollis",
          ownerEmail: "",
          ownerPhone: "0113 496 0000",
        }),
      ),
    ).toMatchObject({ ownerName: "Jean Hollis", ownerEmail: null, ownerPhone: "0113 496 0000" });
  });

  it("checks a new owner's email", () => {
    expect(
      errors(
        relationshipStepSchema,
        values({ ownershipType: "managed", ownerMode: "new", ownerName: "J", ownerEmail: "nope" }),
      ),
    ).toEqual({ ownerEmail: ["Enter a valid email address"] });
  });

  it("needs a head rent for a master lease, with the landlord optional", () => {
    expect(
      errors(relationshipStepSchema, values({ ownershipType: "master_lease", ownerMode: "none" })),
    ).toEqual({ headRent: ["Enter the head rent"] });
    expect(
      relationshipStepSchema.parse(
        values({ ownershipType: "master_lease", ownerMode: "none", headRent: "1,650" }),
      ),
    ).toEqual({ ownershipType: "master_lease", headRent: 165_000, ownerMode: "none", tags: [] });
  });

  it("asks how the property is held when nothing is chosen", () => {
    expect(errors(relationshipStepSchema, values({ ownershipType: "" })).ownershipType).toEqual([
      "Choose how you hold this property",
    ]);
  });
});

describe("toCreatePropertyArgs", () => {
  const ORG = "9b2c5f3e-1d4a-4c8b-9e7f-0a1b2c3d4e5f";

  it("maps a 6 room owned HMO onto the database function", () => {
    const args = toCreatePropertyArgs(ORG, newPropertySchema.parse(values()));
    expect(args).toEqual({
      p_org_id: ORG,
      p_address_line_1: "42 Ash Grove Terrace",
      p_address_line_2: null,
      p_town: "Leeds",
      p_postcode: "LS6 3HD",
      p_council: "Leeds",
      p_property_type: "house",
      p_letting_type: "house_share",
      p_room_count: 6,
      p_room_rent_pence: null,
      p_ownership_type: "owned",
      p_head_rent_pence: null,
      p_owner_id: null,
      p_new_owner_name: null,
      p_new_owner_email: null,
      p_new_owner_phone: null,
      p_tags: [],
    });
  });

  it("passes an existing owner, or a new one, but never both", () => {
    const existing = toCreatePropertyArgs(
      ORG,
      newPropertySchema.parse(values({ ownershipType: "managed", ownerId: OWNER_ID })),
    );
    expect(existing).toMatchObject({ p_owner_id: OWNER_ID, p_new_owner_name: null });

    const brandNew = toCreatePropertyArgs(
      ORG,
      newPropertySchema.parse(
        values({
          ownershipType: "master_lease",
          headRent: "1650",
          ownerMode: "new",
          ownerName: "Trentside Estates Ltd",
          ownerId: OWNER_ID,
        }),
      ),
    );
    expect(brandNew).toMatchObject({
      p_owner_id: null,
      p_new_owner_name: "Trentside Estates Ltd",
      p_head_rent_pence: 165_000,
    });
  });
});
