import { describe, expect, it } from "vitest";
import { type ActivityNames, type ActivityRow, describeActivity } from "./activity";

const names: ActivityNames = {
  rooms: new Map([["room-3", "Room 3"]]),
  owners: new Map([["owner-1", "Margaret Ellison"]]),
  tenancyRooms: new Map([["tenancy-1", "room-3"]]),
};

function row(overrides: Partial<ActivityRow>): ActivityRow {
  return {
    id: "a1",
    table_name: "rooms",
    record_id: "room-3",
    action: "update",
    before: null,
    after: null,
    created_at: "2026-10-21T13:05:00Z",
    actor_user_id: "u1",
    actor_name: "Alice Adams",
    ...overrides,
  };
}

const room = { id: "room-3", name: "Room 3", rent_pence: 52000, status: "available" };

describe("describeActivity", () => {
  it("says who changed a room's rent, from what to what, and when (UK time)", () => {
    expect(
      describeActivity(
        row({
          before: { ...room, updated_at: "a" },
          after: { ...room, rent_pence: 55000, updated_at: "b" },
        }),
        names,
      ),
    ).toEqual({
      id: "a1",
      subject: "Room 3",
      summary: "Room updated",
      changes: [{ label: "Rent", from: "£520.00", to: "£550.00" }],
      who: "Alice Adams",
      when: "21/10/2026 14:05",
    });
  });

  it("describes added and archived rooms", () => {
    expect(describeActivity(row({ action: "insert", after: room }), names)).toMatchObject({
      subject: "Room 3",
      summary: "Room added",
    });
    expect(
      describeActivity(row({ before: room, after: { ...room, status: "archived" } }), names),
    ).toMatchObject({ summary: "Room archived", changes: [] });
  });

  it("describes owners by name", () => {
    const link = { owner_id: "owner-1", property_id: "p1", status: "active" };
    expect(
      describeActivity(
        row({ table_name: "property_owners", action: "insert", after: link }),
        names,
      ),
    ).toMatchObject({ subject: "Margaret Ellison", summary: "Linked as owner" });
    expect(
      describeActivity(
        row({ table_name: "property_owners", before: link, after: { ...link, status: "removed" } }),
        names,
      ),
    ).toMatchObject({ subject: "Margaret Ellison", summary: "No longer the owner" });
  });

  it("describes documents and tenancies", () => {
    expect(
      describeActivity(
        row({
          table_name: "documents",
          action: "insert",
          after: { document_type: "eicr", file_name: "eicr.pdf" },
        }),
        names,
      ),
    ).toMatchObject({ subject: "Electrical report (EICR)", summary: "Uploaded eicr.pdf" });
    expect(
      describeActivity(
        row({
          table_name: "tenancy_tenants",
          action: "insert",
          after: { tenancy_id: "tenancy-1", tenant_id: "t1" },
        }),
        names,
      ),
    ).toMatchObject({ subject: "Tenancy in Room 3", summary: "Tenant added" });
  });

  it("says long text changed without repeating it, and formats other values", () => {
    const property = {
      description: "Old",
      bills_included: false,
      amenities: [],
      ownership_type: "owned",
      head_rent_pence: null,
    };
    expect(
      describeActivity(
        row({
          table_name: "properties",
          before: property,
          after: {
            ...property,
            description: "New",
            bills_included: true,
            amenities: ["Wi-Fi", "Garden"],
            ownership_type: "master_lease",
            head_rent_pence: 165000,
          },
        }),
        names,
      ).changes,
    ).toEqual([
      { label: "Description", from: null, to: null },
      { label: "Bills included", from: "No", to: "Yes" },
      { label: "Amenities", from: null, to: "Wi-Fi, Garden" },
      { label: "How you hold it", from: "Owned", to: "Master lease" },
      { label: "Head rent", from: null, to: "£1,650.00" },
    ]);
  });

  it("names changes made without a signed-in user", () => {
    expect(describeActivity(row({ actor_name: null, after: room }), names).who).toBe("The system");
  });
});
