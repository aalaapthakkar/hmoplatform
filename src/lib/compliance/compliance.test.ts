import { describe, expect, it } from "vitest";
import { detailsToForm, fieldKey, fieldsSchema, formatDetail, parseDetails } from "./fields";
import {
  byUrgency,
  type ComplianceItem,
  daysLeftLabel,
  expiryFrom,
  ragCounts,
  ragOf,
} from "./status";

const LICENCE_FIELDS = [
  { key: "licence_number", label: "Licence number", kind: "text" as const },
  {
    key: "scheme",
    label: "Scheme",
    kind: "choice" as const,
    options: ["Mandatory", "Additional", "Selective"],
  },
  { key: "max_occupants", label: "Maximum occupants", kind: "number" as const },
  { key: "granted_on", label: "Granted on", kind: "date" as const },
  { key: "conditions", label: "Conditions", kind: "long_text" as const },
];

describe("status", () => {
  it("maps statuses to red, amber, green and grey", () => {
    expect(
      ["overdue", "missing", "due_soon", "ok", "not_needed"].map((s) => ragOf(s as never)),
    ).toEqual(["red", "red", "amber", "green", "grey"]);
    expect(
      ragCounts([
        { status: "ok" },
        { status: "missing" },
        { status: "overdue" },
        { status: "due_soon" },
      ]),
    ).toEqual({ red: 2, amber: 1, green: 1, grey: 0 });
  });

  it("works out expiry from the date done and the validity", () => {
    expect(expiryFrom("2026-03-15", 12)).toBe("2027-03-15");
    expect(expiryFrom("2026-01-31", 1)).toBe("2026-02-28");
    expect(expiryFrom("2024-02-29", 12)).toBe("2025-02-28");
    expect(expiryFrom("2026-03-15", null)).toBeNull();
  });

  it("describes days left", () => {
    expect(daysLeftLabel(-3)).toBe("Expired 3 days ago");
    expect(daysLeftLabel(-1)).toBe("Expired yesterday");
    expect(daysLeftLabel(0)).toBe("Expires today");
    expect(daysLeftLabel(1)).toBe("Expires tomorrow");
    expect(daysLeftLabel(40)).toBe("In 40 days");
    expect(daysLeftLabel(null)).toBeNull();
  });

  it("sorts worst first, then soonest", () => {
    const item = (name: string, status: ComplianceItem["status"], days: number | null) =>
      ({ service_name: name, status, days_left: days }) as ComplianceItem;
    const sorted = [
      item("EPC", "ok", 300),
      item("Gas", "due_soon", 20),
      item("PAT", "overdue", -2),
      item("Boiler", "due_soon", 5),
      item("Licence", "missing", null),
    ].sort(byUrgency);
    expect(sorted.map((i) => i.service_name)).toEqual(["PAT", "Licence", "Boiler", "Gas", "EPC"]);
  });
});

describe("extra fields", () => {
  it("checks field definitions like the database does", () => {
    expect(fieldsSchema.safeParse(LICENCE_FIELDS).success).toBe(true);
    expect(fieldsSchema.safeParse([{ key: "Bad Key", label: "x", kind: "text" }]).success).toBe(
      false,
    );
    expect(
      fieldsSchema.safeParse([{ key: "scheme", label: "Scheme", kind: "choice" }]).success,
    ).toBe(false);
    expect(
      fieldsSchema.safeParse([
        { key: "a", label: "A", kind: "text" },
        { key: "a", label: "B", kind: "text" },
      ]).success,
    ).toBe(false);
  });

  it("makes keys from labels", () => {
    expect(fieldKey("Licence number")).toBe("licence_number");
    expect(fieldKey("  Max. occupants (people) ")).toBe("max_occupants_people");
    expect(fieldKey("2nd inspector")).toBe("field_2nd_inspector");
  });

  it("turns form answers into stored details", () => {
    expect(
      parseDetails(LICENCE_FIELDS, {
        licence_number: " HMO/2026/0042 ",
        scheme: "Additional",
        max_occupants: "6",
        granted_on: "2026-04-01",
        conditions: "",
      }),
    ).toEqual({
      ok: true,
      details: {
        licence_number: "HMO/2026/0042",
        scheme: "Additional",
        max_occupants: 6,
        granted_on: "2026-04-01",
        conditions: null,
      },
    });
    expect(
      parseDetails(LICENCE_FIELDS, {
        scheme: "Optional",
        max_occupants: "six",
        granted_on: "2026-02-30",
      }),
    ).toEqual({
      ok: false,
      errors: {
        scheme: "Choose one of the options",
        max_occupants: "Enter a number",
        granted_on: "Enter a real date",
      },
    });
  });

  it("shows details in UK style and fills forms back in", () => {
    expect(formatDetail(LICENCE_FIELDS[3]!, "2026-04-01")).toBe("01/04/2026");
    expect(formatDetail(LICENCE_FIELDS[2]!, 1200)).toBe("1,200");
    expect(formatDetail(LICENCE_FIELDS[0]!, null)).toBeNull();
    expect(detailsToForm(LICENCE_FIELDS, { max_occupants: 6, scheme: "Mandatory" })).toEqual({
      licence_number: "",
      scheme: "Mandatory",
      max_occupants: "6",
      granted_on: "",
      conditions: "",
    });
  });
});
