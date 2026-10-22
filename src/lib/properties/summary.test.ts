import { describe, expect, it } from "vitest";
import {
  allTags,
  groupProperties,
  parsePropertyFilters,
  propertiesHref,
  type PropertyListRow,
  type PropertySummary,
  summariseProperty,
} from "./summary";

function row(overrides: Partial<PropertyListRow> = {}): PropertyListRow {
  return {
    id: "p1",
    address_line_1: "18 Copperfield Road",
    address_line_2: "Fallowfield",
    town: "Manchester",
    postcode: "M14 6PZ",
    tags: [],
    status: "active",
    letting_type: "house_share",
    rooms: [],
    ...overrides,
  };
}

const room = (status: PropertyListRow["rooms"][number]["status"]) => ({ status });

describe("summariseProperty", () => {
  it("counts let rooms out of all rooms that aren't archived", () => {
    const summary = summariseProperty(
      row({
        rooms: [
          room("let"),
          room("let"),
          room("let"),
          room("let"),
          room("let"),
          room("available"),
          room("archived"),
        ],
      }),
      0,
    );
    expect(summary.occupancy).toBe("5 of 6 rooms let");
  });

  it("counts unavailable rooms as not let", () => {
    expect(summariseProperty(row({ rooms: [room("let"), room("unavailable")] }), 0).occupancy).toBe(
      "1 of 2 rooms let",
    );
  });

  it("says 'room' for a single room", () => {
    expect(summariseProperty(row({ rooms: [room("available")] }), 0).occupancy).toBe(
      "0 of 1 room let",
    );
  });

  it("shows a single let as Let or Vacant", () => {
    const singleLet = (status: "let" | "available") =>
      summariseProperty(row({ letting_type: "single_let", rooms: [room(status)] }), 0).occupancy;
    expect(singleLet("let")).toBe("Let");
    expect(singleLet("available")).toBe("Vacant");
  });

  it("handles a property with no rooms", () => {
    expect(summariseProperty(row(), 0).occupancy).toBe("No rooms yet");
  });

  it("joins the second line, town and postcode", () => {
    expect(summariseProperty(row(), 0).locality).toBe("Fallowfield, Manchester M14 6PZ");
    expect(summariseProperty(row({ address_line_2: null }), 0).locality).toBe("Manchester M14 6PZ");
  });

  it("carries the overdue compliance count", () => {
    expect(summariseProperty(row(), 3).overdue).toBe(3);
  });
});

function summary(id: string, tags: string[], active = true): PropertySummary {
  return { id, addressLine1: id, locality: "", tags, active, occupancy: "", overdue: 0 };
}

describe("groupProperties", () => {
  const properties = [
    summary("a", ["students", "Licensed HMO"]),
    summary("b", ["professionals"]),
    summary("c", []),
    summary("d", ["students"], false),
  ];
  const ids = (groups: ReturnType<typeof groupProperties>) =>
    groups.map((group) => [group.tag, group.properties.map((property) => property.id)]);

  it("groups active properties by tag, A to Z, with untagged ones last", () => {
    expect(ids(groupProperties(properties, { status: "active" }))).toEqual([
      ["Licensed HMO", ["a"]],
      ["professionals", ["b"]],
      ["students", ["a"]],
      [null, ["c"]],
    ]);
  });

  it("filters by status", () => {
    expect(ids(groupProperties(properties, { status: "inactive" }))).toEqual([["students", ["d"]]]);
    expect(ids(groupProperties(properties, { status: "all" }))).toContainEqual([
      "students",
      ["a", "d"],
    ]);
  });

  it("shows only the chosen tag's group", () => {
    expect(ids(groupProperties(properties, { status: "all", tag: "students" }))).toEqual([
      ["students", ["a", "d"]],
    ]);
    expect(groupProperties(properties, { status: "active", tag: "nope" })).toEqual([]);
  });

  it("lists every tag once for the filter", () => {
    expect(allTags(properties)).toEqual(["Licensed HMO", "professionals", "students"]);
  });
});

describe("parsePropertyFilters", () => {
  it("defaults to active properties and all tags", () => {
    expect(parsePropertyFilters({})).toEqual({ status: "active", tag: undefined });
  });

  it("reads the tag and status from the URL", () => {
    expect(parsePropertyFilters({ tag: " students ", status: "inactive" })).toEqual({
      status: "inactive",
      tag: "students",
    });
  });

  it("ignores values it doesn't understand", () => {
    expect(parsePropertyFilters({ status: "deleted", tag: ["a", "b"] })).toEqual({
      status: "active",
      tag: "a",
    });
    expect(parsePropertyFilters({ tag: "" }).tag).toBeUndefined();
  });
});

describe("propertiesHref", () => {
  it("leaves the defaults out of the URL", () => {
    expect(propertiesHref({ status: "active" })).toBe("/properties");
    expect(propertiesHref({ status: "all", tag: "licensed HMO" })).toBe(
      "/properties?tag=licensed+HMO&status=all",
    );
  });
});
