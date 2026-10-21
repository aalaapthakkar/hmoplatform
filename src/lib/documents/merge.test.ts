import { describe, expect, it } from "vitest";
import { mergeTemplate, tenancyMergeValues, toBlocks, unknownFields, usedFields } from "./merge";

describe("merge fields", () => {
  it("finds each field once, allowing spaces inside the braces", () => {
    expect(usedFields("Hi {{tenant_name}}, {{ room }} and {{tenant_name}} again")).toEqual([
      "tenant_name",
      "room",
    ]);
  });

  it("flags fields that don't exist, and guarantor fields outside a guarantor agreement", () => {
    expect(
      unknownFields("{{rent}} {{tenant_nmae}} {{guarantor_name}}", "tenancy_agreement"),
    ).toEqual(["tenant_nmae", "guarantor_name"]);
    expect(unknownFields("{{guarantor_name}}", "guarantor_agreement")).toEqual([]);
  });

  it("fills in values and marks anything missing", () => {
    expect(
      mergeTemplate("{{tenant_name}} pays {{rent}} {{rent_frequency}}.", {
        tenant_name: "Priya",
        rent: "£550.00",
      }),
    ).toBe("Priya pays £550.00 [not set].");
  });

  it("doesn't treat merged values as fields themselves", () => {
    expect(mergeTemplate("{{tenant_name}}", { tenant_name: "{{deposit}}" })).toBe("{{deposit}}");
  });
});

describe("toBlocks", () => {
  it("reads headings, paragraphs and bullet points", () => {
    expect(
      toBlocks(
        "# Title\n\nFirst line\nsame paragraph.\n\n## Parties\n- Landlord\n- Tenant\nAfter the list.",
      ),
    ).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "First line same paragraph." },
      { type: "heading", level: 2, text: "Parties" },
      { type: "list", items: ["Landlord", "Tenant"] },
      { type: "paragraph", text: "After the list." },
    ]);
  });
});

describe("tenancyMergeValues", () => {
  it("formats a tenancy for the agreement, with the organisation as landlord when there's no owner", () => {
    expect(
      tenancyMergeValues({
        tenantName: "Priya Shah",
        tenantEmail: "priya@example.com",
        room: "Room 2",
        propertyAddress: "42 Ash Grove, Leeds LS6 3HD",
        rentPence: 13_000,
        rentFrequency: "weekly",
        rentDueDay: 5,
        depositPence: 65_000,
        startDate: "2026-11-01",
        organisationName: "Northern Rooms Ltd",
        landlordName: null,
        today: "2026-10-21",
      }),
    ).toMatchObject({
      rent: "£130.00",
      rent_frequency: "per week",
      rent_due_day: "Friday of each week",
      deposit: "£650.00",
      start_date: "01/11/2026",
      today: "21/10/2026",
      landlord_name: "Northern Rooms Ltd",
    });
  });
});
