import { z } from "zod";

/** Same rule as the properties_postcode_format check in the database. */
const POSTCODE_PATTERN = /^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$/;

/** Upper case with a single space before the last three characters, e.g. "m146pz" -> "M14 6PZ". */
export function normalisePostcode(value: string): string {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

export function isValidPostcode(value: string): boolean {
  return POSTCODE_PATTERN.test(normalisePostcode(value));
}

const MAX_PENCE = 100_000_000; // £1,000,000

/**
 * Turns an amount typed in pounds ("550", "£1,250.5", "99.99") into whole
 * pence, using string arithmetic so no floating point is involved. Returns
 * null for anything that isn't a positive-or-zero amount with at most 2 decimals.
 */
export function poundsToPence(value: string): number | null {
  const cleaned = value.trim().replace(/^£/, "").replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const pence = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return pence <= MAX_PENCE ? pence : null;
}

/** Splits "students, Licensed HMO, students" into ["students", "Licensed HMO"]. */
export function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

const amount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .transform((value, ctx) => {
      const pence = poundsToPence(value);
      if (pence === null) {
        ctx.addIssue({ code: "custom", message: "Enter an amount in pounds, like 550 or 550.50" });
        return z.NEVER;
      }
      return pence;
    });

const optionalAmount = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const pence = poundsToPence(value);
    if (pence === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in pounds, like 550 or 550.50" });
      return z.NEVER;
    }
    return pence;
  });

export const PROPERTY_TYPES = ["house", "flat", "maisonette", "bungalow", "other"] as const;
export const LETTING_TYPES = ["house_share", "single_let"] as const;
export const OWNERSHIP_TYPES = ["owned", "managed", "master_lease"] as const;
export const MAX_ROOMS = 50;

/** Step 1: where the property is. */
export const addressStepSchema = z.object({
  postcode: z
    .string()
    .trim()
    .min(1, "Enter the postcode")
    .transform(normalisePostcode)
    .refine(
      (postcode) => POSTCODE_PATTERN.test(postcode),
      "Enter a full UK postcode, like M14 6PZ",
    ),
  addressLine1: z
    .string()
    .trim()
    .min(1, "Enter the first line of the address")
    .max(120, "Use 120 characters or fewer"),
  addressLine2: optionalText(120, "Use 120 characters or fewer"),
  town: z.string().trim().min(1, "Enter the town or city").max(80, "Use 80 characters or fewer"),
  council: optionalText(120, "Use 120 characters or fewer"),
  propertyType: z.enum(PROPERTY_TYPES, "Choose the type of property"),
});

/** Step 2: how it's let. */
export const rentalStepSchema = z.object({
  lettingType: z.enum(LETTING_TYPES, "Choose house share or single let"),
  roomCount: z
    .string()
    .trim()
    .min(1, "Enter the number of rooms")
    .pipe(
      z
        .string()
        .regex(/^\d+$/, "Enter a whole number")
        .transform(Number)
        .refine(
          (count) => count >= 1 && count <= MAX_ROOMS,
          `Enter a number from 1 to ${MAX_ROOMS}`,
        ),
    ),
  roomRent: optionalAmount,
});

const newOwnerFields = {
  ownerName: z
    .string()
    .trim()
    .min(1, "Enter the owner's name")
    .max(120, "Use 120 characters or fewer"),
  ownerEmail: z
    .string()
    .trim()
    .max(254)
    .transform((value) => value || null)
    .pipe(z.email("Enter a valid email address").nullable()),
  ownerPhone: optionalText(30, "Use 30 characters or fewer"),
};

const existingOwnerFields = { ownerId: z.uuid("Choose an owner") };
const headRentFields = { headRent: amount("head rent") };

const tagsField = z
  .string()
  .transform(parseTags)
  .refine((tags) => tags.length <= 10, "Use 10 tags or fewer")
  .refine(
    (tags) => tags.every((tag) => tag.length <= 30),
    "Keep each tag to 30 characters or fewer",
  );

const managed = z.literal("managed");
const masterLease = z.literal("master_lease");

/**
 * Step 3: who owns it and how the org holds it. A managed property needs an
 * owner, existing or new; on a master lease the landlord is optional.
 */
export const relationshipStepSchema = z.intersection(
  z.discriminatedUnion(
    "ownershipType",
    [
      z.object({ ownershipType: z.literal("owned") }),
      z.discriminatedUnion("ownerMode", [
        z.object({
          ownershipType: managed,
          ownerMode: z.literal("existing"),
          ...existingOwnerFields,
        }),
        z.object({ ownershipType: managed, ownerMode: z.literal("new"), ...newOwnerFields }),
      ]),
      z.discriminatedUnion("ownerMode", [
        z.object({ ownershipType: masterLease, ownerMode: z.literal("none"), ...headRentFields }),
        z.object({
          ownershipType: masterLease,
          ownerMode: z.literal("existing"),
          ...headRentFields,
          ...existingOwnerFields,
        }),
        z.object({
          ownershipType: masterLease,
          ownerMode: z.literal("new"),
          ...headRentFields,
          ...newOwnerFields,
        }),
      ]),
    ],
    { error: () => "Choose how you hold this property" },
  ),
  z.object({ tags: tagsField }),
);

/** Everything the wizard sends to the server, checked again there. */
export const newPropertySchema = z.intersection(
  addressStepSchema.and(rentalStepSchema),
  relationshipStepSchema,
);

export type NewProperty = z.infer<typeof newPropertySchema>;

/** The wizard's form values: everything is a string until it's validated. */
export type PropertyWizardValues = {
  postcode: string;
  addressLine1: string;
  addressLine2: string;
  town: string;
  council: string;
  propertyType: string;
  lettingType: string;
  roomCount: string;
  roomRent: string;
  ownershipType: string;
  headRent: string;
  ownerMode: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  tags: string;
};

/** Arguments for the create_property database function. */
export function toCreatePropertyArgs(orgId: string, property: NewProperty) {
  const owner =
    "ownerMode" in property && property.ownerMode === "existing"
      ? { id: property.ownerId, name: null, email: null, phone: null }
      : "ownerMode" in property && property.ownerMode === "new"
        ? {
            id: null,
            name: property.ownerName,
            email: property.ownerEmail,
            phone: property.ownerPhone,
          }
        : { id: null, name: null, email: null, phone: null };

  return {
    p_org_id: orgId,
    p_address_line_1: property.addressLine1,
    p_address_line_2: property.addressLine2,
    p_town: property.town,
    p_postcode: property.postcode,
    p_council: property.council,
    p_property_type: property.propertyType,
    p_letting_type: property.lettingType,
    p_room_count: property.roomCount,
    p_room_rent_pence: property.roomRent,
    p_ownership_type: property.ownershipType,
    p_head_rent_pence: property.ownershipType === "master_lease" ? property.headRent : null,
    p_owner_id: owner.id,
    p_new_owner_name: owner.name,
    p_new_owner_email: owner.email,
    p_new_owner_phone: owner.phone,
    p_tags: property.tags,
  };
}
