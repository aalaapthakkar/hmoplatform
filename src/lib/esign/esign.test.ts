import { describe, expect, it, vi } from "vitest";
import { dropboxSign, dropboxSignEventHash } from "./dropbox-sign";
import { fakeSignature } from "./fake";
import { EsignNotReady, overallStatus } from "./types";

const KEY = "test-api-key-1234567890";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function webhookRequest(payload: unknown) {
  const form = new FormData();
  form.set("json", JSON.stringify(payload));
  return new Request("http://localhost/api/esign/webhook", { method: "POST", body: form });
}

describe("overallStatus", () => {
  const signer = (status: "awaiting" | "signed" | "declined") => ({
    email: "a@example.com",
    status,
  });

  it("works out the request's status from its signers", () => {
    expect(overallStatus([signer("awaiting"), signer("awaiting")])).toBe("sent");
    expect(overallStatus([signer("signed"), signer("awaiting")])).toBe("partly_signed");
    expect(overallStatus([signer("signed"), signer("signed")])).toBe("completed");
    expect(overallStatus([signer("signed"), signer("declined")])).toBe("declined");
    expect(overallStatus([signer("signed")], { cancelled: true })).toBe("cancelled");
  });
});

describe("Dropbox Sign", () => {
  it("always sends in test mode, with the signers in order and Basic auth", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ signature_request: { signature_request_id: "abc123" } }));
    const provider = dropboxSign(KEY, fetchImpl);
    await expect(
      provider.send({
        title: "Tenancy agreement",
        subject: "Please sign",
        message: "Thanks",
        fileName: "agreement.pdf",
        pdf: new Uint8Array([37, 80, 68, 70]),
        signers: [
          { role: "tenant", name: "Tess", email: "tess@example.com", order: 1 },
          { role: "organisation", name: "Alice", email: "alice@example.com", order: 2 },
        ],
        metadata: { tenancy_id: "t1" },
      }),
    ).resolves.toEqual({ providerRequestId: "abc123" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.hellosign.com/v3/signature_request/send");
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`,
    );
    const body = init!.body as FormData;
    expect(body.get("test_mode")).toBe("1");
    expect(body.get("signers[0][email_address]")).toBe("tess@example.com");
    expect(body.get("signers[1][order]")).toBe("1");
    expect(body.get("metadata[tenancy_id]")).toBe("t1");
    expect(body.get("files[0]")).toBeInstanceOf(Blob);
  });

  it("maps a signature request's status", async () => {
    const provider = dropboxSign(
      KEY,
      vi.fn<typeof fetch>().mockResolvedValue(
        json({
          signature_request: {
            signature_request_id: "abc123",
            signatures: [
              {
                signer_email_address: "Tess@Example.com",
                status_code: "signed",
                signed_at: 1792500000,
              },
              { signer_email_address: "alice@example.com", status_code: "awaiting_signature" },
            ],
          },
        }),
      ),
    );
    await expect(provider.getStatus("abc123")).resolves.toEqual({
      requestStatus: "partly_signed",
      signers: [
        {
          email: "tess@example.com",
          status: "signed",
          signedAt: new Date(1792500000 * 1000).toISOString(),
        },
        { email: "alice@example.com", status: "awaiting", signedAt: undefined },
      ],
    });
  });

  it("says when the signed file isn't ready, and never repeats the provider's reply in errors", async () => {
    const notReady = dropboxSign(KEY, vi.fn<typeof fetch>().mockResolvedValue(json({}, 409)));
    await expect(notReady.downloadSigned("abc")).rejects.toBeInstanceOf(EsignNotReady);
    const failing = dropboxSign(
      KEY,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ error: { error_msg: "tess@example.com is bad" } }, 400)),
    );
    await expect(failing.cancel("abc")).rejects.toThrow("Dropbox Sign replied 400");
    await expect(failing.cancel("abc")).rejects.not.toThrow(/tess@/);
  });

  it("accepts only webhooks signed with the API key", async () => {
    const provider = dropboxSign(KEY, vi.fn<typeof fetch>());
    const event = { event_time: "1792500000", event_type: "signature_request_signed" };
    const payload = {
      event: {
        ...event,
        event_hash: dropboxSignEventHash(KEY, event.event_time, event.event_type),
      },
      signature_request: {
        signature_request_id: "abc123",
        signatures: [{ signer_email_address: "tess@example.com", status_code: "signed" }],
      },
    };

    const good = await provider.verifyWebhook(webhookRequest(payload));
    expect(good.verified).toBe(true);
    if (good.verified) {
      expect(good.event).toMatchObject({
        providerRequestId: "abc123",
        eventType: "signature_request_signed",
        status: { requestStatus: "completed" },
      });
      expect(await good.acknowledge().text()).toBe("Hello API Event Received");
    }

    const forged = await provider.verifyWebhook(
      webhookRequest({ ...payload, event: { ...payload.event, event_hash: "00".repeat(32) } }),
    );
    expect(forged.verified).toBe(false);
    const otherKey = await dropboxSign(
      "someone-elses-key-123",
      vi.fn<typeof fetch>(),
    ).verifyWebhook(webhookRequest(payload));
    expect(otherKey.verified).toBe(false);
    expect((await provider.verifyWebhook(webhookRequest("not json"))).verified).toBe(false);
  });

  it("acknowledges a verified ping with nothing to apply", async () => {
    const event = { event_time: "1792500000", event_type: "callback_test" };
    const result = await dropboxSign(KEY, vi.fn<typeof fetch>()).verifyWebhook(
      webhookRequest({
        event: {
          ...event,
          event_hash: dropboxSignEventHash(KEY, event.event_time, event.event_type),
        },
      }),
    );
    expect(result).toMatchObject({ verified: true, event: null });
  });
});

describe("fake provider signatures", () => {
  it("depend on the secret and the exact body", () => {
    expect(fakeSignature("secret-a", "{}")).not.toBe(fakeSignature("secret-b", "{}"));
    expect(fakeSignature("secret-a", "{}")).not.toBe(fakeSignature("secret-a", "{ }"));
  });
});
