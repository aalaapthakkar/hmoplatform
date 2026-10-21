import { describe, expect, it } from "vitest";
import { type MessageRow, snippet, summariseThreads } from "./threads";

const message = (
  id: string,
  tenancy: string,
  at: string,
  sender: MessageRow["sender"],
): MessageRow => ({
  id,
  tenancy_id: tenancy,
  sender,
  author_user_id: null,
  body: `Message ${id}`,
  created_at: at,
});

describe("summariseThreads", () => {
  it("groups by tenancy, newest conversation first, and spots who owes a reply", () => {
    const threads = summariseThreads([
      message("1", "a", "2026-10-01T09:00:00Z", "tenant"),
      message("2", "b", "2026-10-02T09:00:00Z", "tenant"),
      message("3", "a", "2026-10-03T09:00:00Z", "staff"),
      message("4", "b", "2026-10-01T08:00:00Z", "staff"),
    ]);
    expect(
      threads.map((thread) => [
        thread.tenancyId,
        thread.latest.id,
        thread.count,
        thread.awaitingReply,
      ]),
    ).toEqual([
      ["a", "3", 2, false],
      ["b", "2", 2, true],
    ]);
  });
});

describe("snippet", () => {
  it("flattens and shortens long messages", () => {
    expect(snippet("Hello\n\nthere")).toBe("Hello there");
    expect(snippet("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
