import { describe, expect, it } from "vitest";
import { messageSchema, photoProblem, repairFolder, repairSchema } from "./maintenance";

describe("repairSchema", () => {
  it("needs a title, a description and an urgency", () => {
    const result = repairSchema.safeParse({
      title: "  Leaking shower ",
      location: "",
      description: "Dripping since Monday.",
      urgency: "urgent",
    });
    expect(result.success && result.data).toEqual({
      title: "Leaking shower",
      location: null,
      description: "Dripping since Monday.",
      urgency: "urgent",
    });
    const empty = repairSchema.safeParse({
      title: "",
      location: "",
      description: "",
      urgency: "x",
    });
    expect(empty.error?.issues.map((issue) => issue.message)).toEqual([
      "Say what needs fixing",
      "Describe the problem",
      "Choose how urgent it is",
    ]);
  });
});

describe("photoProblem", () => {
  it("accepts photos, including untyped HEIC, and nothing else", () => {
    expect(photoProblem({ name: "leak.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(photoProblem({ name: "leak.HEIC", type: "", size: 1000 })).toBeNull();
    expect(photoProblem({ name: "notes.pdf", type: "application/pdf", size: 1000 })).toMatch(
      /isn't a photo/,
    );
    expect(photoProblem({ name: "big.png", type: "image/png", size: 21 * 1024 * 1024 })).toMatch(
      /over 20 MB/,
    );
    expect(photoProblem({ name: "empty.png", type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("repairFolder", () => {
  it("matches the storage policy's path", () => {
    expect(repairFolder("org", "req")).toBe("org/maintenance/req/");
  });
});

describe("messageSchema", () => {
  it("needs some text", () => {
    expect(messageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(messageSchema.safeParse({ body: "Hello" }).success).toBe(true);
  });
});
