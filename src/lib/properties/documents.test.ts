import { describe, expect, it } from "vitest";
import { expiryState, summariseDocument } from "./documents";

const TODAY = "2026-10-21";

describe("expiryState", () => {
  it.each([
    [null, "none"],
    ["2026-10-20", "expired"],
    ["2026-10-21", "soon"],
    ["2026-11-20", "soon"],
    ["2026-11-21", "valid"],
  ] as const)("%s is %s", (date, state) => {
    expect(expiryState(date, TODAY)).toBe(state);
  });
});

describe("summariseDocument", () => {
  it("labels the type and shows UK dates and who uploaded it", () => {
    expect(
      summariseDocument(
        {
          id: "d1",
          document_type: "gas_safety",
          file_name: "gas.pdf",
          expiry_date: "2026-10-01",
          status: "active",
          created_at: "2025-10-01T09:00:00Z",
          users: { full_name: null, email: "alice@example.com" },
        },
        TODAY,
      ),
    ).toEqual({
      id: "d1",
      typeLabel: "Gas safety certificate",
      fileName: "gas.pdf",
      expiry: "01/10/2026",
      expiryState: "expired",
      uploadedBy: "alice@example.com",
      uploadedOn: "01/10/2025",
      active: true,
    });
  });
});
