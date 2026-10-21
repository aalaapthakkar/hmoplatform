import { z } from "zod";
import { optionalText, parseTags } from "./property";

/** Offered as tick boxes. Anything else goes in "other amenities". */
export const COMMON_AMENITIES = [
  "Wi-Fi",
  "Washing machine",
  "Tumble dryer",
  "Dishwasher",
  "Shared lounge",
  "Garden",
  "Off-street parking",
  "Bike storage",
  "Regular cleaner",
  "TV licence",
] as const;

export type DetailsFormValues = {
  description: string;
  /** The ticked common amenities, comma separated. */
  amenities: string;
  otherAmenities: string;
  houseRules: string;
  billsIncluded: string;
};

const TOO_LONG = "Use 5,000 characters or fewer";

export const detailsSchema = z
  .object({
    description: optionalText(5000, TOO_LONG),
    amenities: z.string(),
    otherAmenities: z.string(),
    houseRules: optionalText(5000, TOO_LONG),
    billsIncluded: z.enum(["yes", "no"]).transform((value) => value === "yes"),
  })
  .transform(({ amenities, otherAmenities, ...details }) => ({
    ...details,
    amenities: parseTags(`${amenities},${otherAmenities}`),
  }))
  .refine((details) => details.amenities.length <= 30, {
    message: "Use 30 amenities or fewer",
    path: ["otherAmenities"],
  })
  .refine((details) => details.amenities.every((amenity) => amenity.length <= 40), {
    message: "Keep each amenity to 40 characters or fewer",
    path: ["otherAmenities"],
  });

export type DetailsInput = z.infer<typeof detailsSchema>;

/** The form's starting values from what's saved. */
export function detailsFormValues(property: {
  description: string | null;
  amenities: string[];
  house_rules: string | null;
  bills_included: boolean;
}): DetailsFormValues {
  const common = new Set<string>(COMMON_AMENITIES.map((amenity) => amenity.toLowerCase()));
  return {
    description: property.description ?? "",
    amenities: property.amenities.filter((a) => common.has(a.toLowerCase())).join(", "),
    otherAmenities: property.amenities.filter((a) => !common.has(a.toLowerCase())).join(", "),
    houseRules: property.house_rules ?? "",
    billsIncluded: property.bills_included ? "yes" : "no",
  };
}
