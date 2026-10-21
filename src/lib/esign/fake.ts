import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EsignError,
  type EsignProvider,
  overallStatus,
  type ProviderEvent,
  type ProviderStatus,
} from "./types";

/**
 * A pretend provider for automated tests (ESIGN_PROVIDER=fake). Requests
 * live in a temporary folder; /dev/esign/<id> lets a test "sign" as each
 * person in order. Never used unless that setting is on.
 */

type FakeRequest = {
  id: string;
  title: string;
  cancelled: boolean;
  signers: {
    email: string;
    name: string;
    order: number;
    status: "awaiting" | "signed";
    signedAt?: string;
  }[];
};

const folder = join(tmpdir(), "hmo-fake-esign");
const safeId = (id: string) => {
  if (!/^fake_[0-9a-f-]{36}$/.test(id)) throw new EsignError("Unknown fake request");
  return id;
};

async function load(id: string): Promise<FakeRequest> {
  try {
    return JSON.parse(await readFile(join(folder, `${safeId(id)}.json`), "utf8"));
  } catch {
    throw new EsignError("Unknown fake request");
  }
}

async function save(request: FakeRequest) {
  await writeFile(join(folder, `${request.id}.json`), JSON.stringify(request));
}

function statusOf(request: FakeRequest): ProviderStatus {
  const signers = request.signers.map((signer) => ({
    email: signer.email,
    status: signer.status,
    signedAt: signer.signedAt,
  }));
  return { signers, requestStatus: overallStatus(signers, { cancelled: request.cancelled }) };
}

export function fakeSignature(secret: string, body: string) {
  return createHmac("sha256", `fake-esign:${secret}`).update(body).digest("hex");
}

export function fakeProvider(secret: string): EsignProvider & {
  /** Signs as the next person in order, as the test page does. */
  sign(id: string, email: string): Promise<ProviderEvent>;
  describe(id: string): Promise<FakeRequest>;
} {
  return {
    name: "fake",

    async send(input) {
      await mkdir(folder, { recursive: true });
      const id = `fake_${randomUUID()}`;
      await writeFile(join(folder, `${id}.pdf`), input.pdf);
      await save({
        id,
        title: input.title,
        cancelled: false,
        signers: input.signers.map((signer) => ({
          email: signer.email.toLowerCase(),
          name: signer.name,
          order: signer.order,
          status: "awaiting",
        })),
      });
      return { providerRequestId: id };
    },

    async getStatus(id) {
      return statusOf(await load(id));
    },

    async cancel(id) {
      const request = await load(id);
      await save({ ...request, cancelled: true });
    },

    async downloadSigned(id) {
      const request = await load(id);
      if (statusOf(request).requestStatus !== "completed") {
        throw new EsignError("Not signed yet");
      }
      return new Uint8Array(await readFile(join(folder, `${safeId(id)}.pdf`)));
    },

    async verifyWebhook(request) {
      const body = await request.text();
      const given = request.headers.get("x-fake-esign-signature") ?? "";
      const expected = fakeSignature(secret, body);
      const ok =
        given.length === expected.length &&
        timingSafeEqual(Buffer.from(given), Buffer.from(expected));
      if (!ok) return { verified: false };
      const event = JSON.parse(body) as ProviderEvent;
      return { verified: true, event, acknowledge: () => new Response("ok") };
    },

    async sign(id, email) {
      const request = await load(id);
      if (request.cancelled) throw new EsignError("This request was cancelled.");
      const next = [...request.signers]
        .sort((a, b) => a.order - b.order)
        .find((signer) => signer.status === "awaiting");
      if (!next || next.email !== email.toLowerCase()) {
        throw new EsignError("It isn't this person's turn to sign.");
      }
      next.status = "signed";
      next.signedAt = new Date().toISOString();
      await save(request);
      return {
        providerRequestId: id,
        eventKey: `fake:${randomUUID()}`,
        eventType: "signature_request_signed",
        eventTime: next.signedAt,
        status: statusOf(request),
      };
    },

    describe: load,
  };
}
