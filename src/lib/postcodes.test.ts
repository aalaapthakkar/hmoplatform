import { describe, expect, it, vi } from "vitest";
import { lookupPostcode } from "./postcodes";

const respond = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("lookupPostcode", () => {
  it("suggests the town and council from the council area", async () => {
    const fetchImpl = respond(200, {
      status: 200,
      result: { postcode: "LS6 3HD", admin_district: "Leeds", region: "Yorkshire and The Humber" },
    });
    await expect(lookupPostcode("ls63hd", fetchImpl)).resolves.toEqual({
      postcode: "LS6 3HD",
      town: "Leeds",
      council: "Leeds",
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.postcodes.io/postcodes/LS6%203HD");
  });

  it("uses London as the town for London boroughs", async () => {
    const fetchImpl = respond(200, {
      result: { postcode: "NW1 8NH", admin_district: "Camden", region: "London" },
    });
    await expect(lookupPostcode("NW1 8NH", fetchImpl)).resolves.toMatchObject({
      town: "London",
      council: "Camden",
    });
  });

  it("returns null for unknown postcodes, errors and odd replies", async () => {
    await expect(
      lookupPostcode("ZZ1 1ZZ", respond(404, { error: "Invalid postcode" })),
    ).resolves.toBeNull();
    await expect(lookupPostcode("LS6 3HD", respond(200, { result: null }))).resolves.toBeNull();
    await expect(
      lookupPostcode("LS6 3HD", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"))),
    ).resolves.toBeNull();
  });

  it("doesn't call the service for something that isn't a postcode", async () => {
    const fetchImpl = respond(200, {});
    await expect(lookupPostcode("LS6", fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
