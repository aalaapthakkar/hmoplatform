import { describe, expect, it } from "vitest";
import { detailsFormValues, detailsSchema } from "./details";

describe("detailsSchema", () => {
  it("combines ticked and other amenities, without duplicates", () => {
    expect(
      detailsSchema.parse({
        description: "  Bright five-bed near the university.  ",
        amenities: "Wi-Fi, Garden",
        otherAmenities: "Gym, wi-fi, ",
        houseRules: "",
        billsIncluded: "yes",
      }),
    ).toEqual({
      description: "Bright five-bed near the university.",
      amenities: ["Wi-Fi", "Garden", "Gym"],
      houseRules: null,
      billsIncluded: true,
    });
  });

  it("limits long text", () => {
    const result = detailsSchema.safeParse({
      description: "x".repeat(5001),
      amenities: "",
      otherAmenities: "",
      houseRules: "",
      billsIncluded: "no",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]).toMatchObject({
      path: ["description"],
      message: "Use 5,000 characters or fewer",
    });
  });
});

describe("detailsFormValues", () => {
  it("splits saved amenities into tick boxes and others", () => {
    expect(
      detailsFormValues({
        description: null,
        amenities: ["wi-fi", "Gym", "Garden"],
        house_rules: "No smoking",
        bills_included: false,
      }),
    ).toEqual({
      description: "",
      amenities: "wi-fi, Garden",
      otherAmenities: "Gym",
      houseRules: "No smoking",
      billsIncluded: "no",
    });
  });
});
