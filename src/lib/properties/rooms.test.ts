import { describe, expect, it } from "vitest";
import { roomSchema, toRoomRow } from "@/lib/validation/room";
import {
  nextRoomName,
  penceToPounds,
  rentLabel,
  type RoomListRow,
  sortRooms,
  summariseRoom,
} from "./rooms";

const tenant = (first: string, overrides = {}) => ({
  status: "active" as const,
  tenants: {
    first_name: first,
    last_name: "Shah",
    email: `${first.toLowerCase()}@example.com`,
    phone: "07700 900101",
    ...overrides,
  },
});

function row(overrides: Partial<RoomListRow> = {}): RoomListRow {
  return {
    id: "r1",
    name: "Room 1",
    rent_pence: 55_000,
    rent_frequency: "monthly",
    size_sqm: "12.50",
    features: ["double bed"],
    status: "let",
    tenancies: [],
    ...overrides,
  };
}

describe("summariseRoom", () => {
  it("shows the rent per month, size and status", () => {
    const room = summariseRoom(row());
    expect(room.rent).toBe("£550.00 per month");
    expect(room.size).toBe("12.5");
    expect(summariseRoom(row({ size_sqm: "100.00" })).size).toBe("100");
    expect(summariseRoom(row({ size_sqm: "100" })).size).toBe("100");
    expect(room.statusLabel).toBe("Let");
    expect(room.currentTenancy).toBeNull();
  });

  it("says when the rent hasn't been set", () => {
    expect(summariseRoom(row({ rent_pence: null })).rent).toBe("Rent not set");
  });

  it("shows the current tenants and their move-in date, ignoring past and future tenancies", () => {
    const room = summariseRoom(
      row({
        tenancies: [
          {
            id: "old",
            start_date: "2025-09-01",
            end_date: "2026-08-31",
            status: "ended",
            tenancy_tenants: [tenant("Old")],
          },
          {
            id: "now",
            start_date: "2026-09-01",
            end_date: null,
            status: "active",
            tenancy_tenants: [tenant("Priya"), { ...tenant("Gone"), status: "removed" }],
          },
          {
            id: "next",
            start_date: "2027-09-01",
            end_date: null,
            status: "prospective",
            tenancy_tenants: [],
          },
        ],
      }),
      "2026-10-21",
    );
    expect(room.currentTenancy).toEqual({
      moveIn: "01/09/2026",
      tenants: [{ name: "Priya Shah", email: "priya@example.com", phone: "07700 900101" }],
      leaving: null,
      endPassed: false,
    });
    expect(room.nextMoveIn).toBe("01/09/2027");
  });

  it("shows when a tenant with notice is leaving, and when to confirm they've gone", () => {
    const ending = (endDate: string) =>
      summariseRoom(
        row({
          tenancies: [
            {
              id: "now",
              start_date: "2026-01-01",
              end_date: endDate,
              status: "ending",
              tenancy_tenants: [tenant("Priya")],
            },
          ],
        }),
        "2026-10-21",
      ).currentTenancy;
    expect(ending("2026-12-31")).toMatchObject({ leaving: "31/12/2026", endPassed: false });
    expect(ending("2026-10-21")).toMatchObject({ leaving: "21/10/2026", endPassed: true });
  });

  it("fills the edit form with pounds, not pence", () => {
    expect(
      summariseRoom(row({ rent_pence: 55_050, features: ["desk", "en suite"] })).formValues,
    ).toEqual({
      name: "Room 1",
      rent: "550.50",
      rentFrequency: "monthly",
      status: "let",
      size: "12.5",
      features: "desk, en suite",
    });
  });
});

describe("rent and pounds", () => {
  it("labels each frequency", () => {
    expect(rentLabel(13_000, "weekly")).toBe("£130.00 per week");
    expect(rentLabel(52_000, "four_weekly")).toBe("£520.00 every 4 weeks");
  });

  it("turns pence back into what a person would type", () => {
    expect(penceToPounds(55_000)).toBe("550");
    expect(penceToPounds(55_005)).toBe("550.05");
    expect(penceToPounds(null)).toBe("");
  });
});

describe("room names", () => {
  it("sorts naturally", () => {
    const names = sortRooms([{ name: "Room 10" }, { name: "Room 2" }, { name: "Attic" }]).map(
      (room) => room.name,
    );
    expect(names).toEqual(["Attic", "Room 2", "Room 10"]);
  });

  it("suggests the next room number", () => {
    expect(nextRoomName(["Room 1", "Room 2", "Room 6", "Attic"])).toBe("Room 7");
    expect(nextRoomName([])).toBe("Room 1");
  });
});

describe("roomSchema", () => {
  const values = {
    name: " Room 7 ",
    rent: "575",
    rentFrequency: "monthly",
    status: "available",
    size: "",
    features: "double bed, desk",
  };

  it("turns the form into database columns", () => {
    expect(toRoomRow(roomSchema.parse(values))).toEqual({
      name: "Room 7",
      rent_pence: 57_500,
      rent_frequency: "monthly",
      status: "available",
      size_sqm: null,
      features: ["double bed", "desk"],
    });
  });

  it("explains what's wrong", () => {
    const result = roomSchema.safeParse({
      ...values,
      name: "",
      rent: "five hundred",
      size: "-3",
      status: "archived",
    });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => [issue.path[0], issue.message]);
    expect(messages).toEqual([
      ["name", "Enter a name for the room"],
      ["rent", "Enter an amount in pounds, like 550 or 550.50"],
      ["status", "Choose the room's status"],
      ["size", "Enter the size in square metres, like 12 or 12.5"],
    ]);
  });
});
