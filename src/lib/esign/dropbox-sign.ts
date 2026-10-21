import { createHmac, timingSafeEqual } from "node:crypto";
import {
  EsignError,
  EsignNotReady,
  type EsignProvider,
  overallStatus,
  type ProviderStatus,
  type SendInput,
} from "./types";

const API = "https://api.hellosign.com/v3";

type DropboxSignRequest = {
  signature_request_id: string;
  is_complete?: boolean;
  is_declined?: boolean;
  has_error?: boolean;
  signatures?: {
    signer_email_address: string;
    status_code: string;
    signed_at?: number | null;
  }[];
};

function toStatus(request: DropboxSignRequest): ProviderStatus {
  const signers = (request.signatures ?? []).map((signature) => ({
    email: signature.signer_email_address.toLowerCase(),
    status:
      signature.status_code === "signed"
        ? ("signed" as const)
        : signature.status_code === "declined"
          ? ("declined" as const)
          : ("awaiting" as const),
    signedAt: signature.signed_at ? new Date(signature.signed_at * 1000).toISOString() : undefined,
  }));
  return {
    signers,
    requestStatus: overallStatus(signers, {
      declined: request.is_declined,
      error: request.has_error,
    }),
  };
}

/** Constant-time comparison of two hex strings. */
function sameHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** The signature Dropbox Sign puts on each event: HMAC-SHA256(event_time + event_type) keyed with the API key. */
export function dropboxSignEventHash(apiKey: string, eventTime: string, eventType: string) {
  return createHmac("sha256", apiKey)
    .update(eventTime + eventType)
    .digest("hex");
}

/**
 * Dropbox Sign, always in test mode: requests are free, marked as tests
 * and not legally binding. The API key is the Basic auth username.
 */
export function dropboxSign(apiKey: string, fetchImpl: typeof fetch = fetch): EsignProvider {
  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

  async function call(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: { Authorization: auth, ...init.headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 409) throw new EsignNotReady("The signed file isn't ready yet.");
    if (!response.ok) {
      // Never pass the provider's body on: it can echo names and emails.
      throw new EsignError(`Dropbox Sign replied ${response.status}`);
    }
    return response;
  }

  return {
    name: "dropbox_sign",

    async send(input: SendInput) {
      const form = new FormData();
      form.set("test_mode", "1");
      form.set("title", input.title);
      form.set("subject", input.subject);
      form.set("message", input.message);
      input.signers.forEach((signer, index) => {
        form.set(`signers[${index}][name]`, signer.name);
        form.set(`signers[${index}][email_address]`, signer.email);
        form.set(`signers[${index}][order]`, String(signer.order - 1));
      });
      for (const [key, value] of Object.entries(input.metadata)) {
        form.set(`metadata[${key}]`, value);
      }
      form.set(
        "files[0]",
        new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }),
        input.fileName,
      );
      const response = await call("/signature_request/send", { method: "POST", body: form });
      const json = (await response.json()) as { signature_request?: DropboxSignRequest };
      const id = json.signature_request?.signature_request_id;
      if (!id) throw new EsignError("Dropbox Sign didn't return a request id");
      return { providerRequestId: id };
    },

    async getStatus(id) {
      const response = await call(`/signature_request/${encodeURIComponent(id)}`);
      const json = (await response.json()) as { signature_request: DropboxSignRequest };
      return toStatus(json.signature_request);
    },

    async cancel(id) {
      await call(`/signature_request/cancel/${encodeURIComponent(id)}`, { method: "POST" });
    },

    async downloadSigned(id) {
      const response = await call(
        `/signature_request/files/${encodeURIComponent(id)}?file_type=pdf`,
      );
      return new Uint8Array(await response.arrayBuffer());
    },

    /**
     * Dropbox Sign posts each event as a "json" form field, signed with
     * dropboxSignEventHash, and expects "Hello API Event Received" back.
     */
    async verifyWebhook(request) {
      let payload: {
        event?: { event_time?: string; event_type?: string; event_hash?: string };
        signature_request?: DropboxSignRequest;
      };
      try {
        const form = await request.formData();
        payload = JSON.parse(String(form.get("json") ?? ""));
      } catch {
        return { verified: false };
      }
      const event = payload.event;
      if (!event?.event_time || !event.event_type || !event.event_hash) return { verified: false };
      const expected = dropboxSignEventHash(apiKey, event.event_time, event.event_type);
      if (!sameHex(expected, event.event_hash)) return { verified: false };

      const acknowledge = () =>
        new Response("Hello API Event Received", { headers: { "Content-Type": "text/plain" } });
      const signatureRequest = payload.signature_request;
      if (!signatureRequest?.signature_request_id) {
        return { verified: true, event: null, acknowledge };
      }

      return {
        verified: true,
        acknowledge,
        event: {
          providerRequestId: signatureRequest.signature_request_id,
          eventKey: `dropbox_sign:${event.event_hash}`,
          eventType: event.event_type,
          eventTime: new Date(Number(event.event_time) * 1000).toISOString(),
          status: toStatus(signatureRequest),
        },
      };
    },
  };
}
