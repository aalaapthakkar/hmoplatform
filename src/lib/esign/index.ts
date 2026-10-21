import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dropboxSign } from "./dropbox-sign";
import { fakeProvider } from "./fake";
import { EsignNotConfigured, type EsignProvider, type ProviderEvent } from "./types";

export * from "./types";

/** Server-only settings from .env.local. Test-mode keys only. */
const envSchema = z.object({
  ESIGN_PROVIDER: z.enum(["dropbox_sign", "fake"]).default("dropbox_sign"),
  DROPBOX_SIGN_API_KEY: z.string().min(10).optional(),
  ESIGN_RELAY_SECRET: z.string().min(32).optional(),
});

function settings() {
  const parsed = envSchema.safeParse({
    ESIGN_PROVIDER: process.env.ESIGN_PROVIDER || undefined,
    DROPBOX_SIGN_API_KEY: process.env.DROPBOX_SIGN_API_KEY || undefined,
    ESIGN_RELAY_SECRET: process.env.ESIGN_RELAY_SECRET || undefined,
  });
  if (!parsed.success) {
    throw new EsignNotConfigured("The e-signing settings in .env.local aren't valid.");
  }
  return parsed.data;
}

function relaySecret() {
  const secret = settings().ESIGN_RELAY_SECRET;
  if (!secret) {
    throw new EsignNotConfigured(
      "E-signing isn't set up yet: add ESIGN_RELAY_SECRET to .env.local and run npm run esign:setup.",
    );
  }
  return secret;
}

/** The provider chosen in .env.local, or EsignNotConfigured with what's missing. */
export function getEsignProvider(): EsignProvider {
  const config = settings();
  if (config.ESIGN_PROVIDER === "fake") return fakeProvider(relaySecret());
  if (!config.DROPBOX_SIGN_API_KEY) {
    throw new EsignNotConfigured(
      "Add your Dropbox Sign test API key to .env.local as DROPBOX_SIGN_API_KEY to send documents for signature.",
    );
  }
  relaySecret();
  return dropboxSign(config.DROPBOX_SIGN_API_KEY);
}

export function getFakeProvider() {
  if (settings().ESIGN_PROVIDER !== "fake") return null;
  return fakeProvider(relaySecret());
}

/**
 * Applies a verified provider event through the one database function that
 * may change signing status. Works without a signed-in user (webhooks).
 */
export async function applyEsignEvent(provider: string, event: ProviderEvent): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("esign_apply_event", {
    p_relay_secret: relaySecret(),
    p_provider: provider,
    p_provider_request_id: event.providerRequestId,
    p_event_key: event.eventKey,
    p_event_type: event.eventType,
    p_event_time: event.eventTime,
    p_request_status: event.status.requestStatus,
    p_signers: event.status.signers,
  });
  if (error) throw new Error("Could not apply the e-sign event", { cause: error.code });
  return data;
}

/** A stable key for a status snapshot, so refreshing the same state twice is ignored. */
export function snapshotKey(provider: string, providerRequestId: string, status: unknown) {
  const digest = createHash("sha256").update(JSON.stringify(status)).digest("hex").slice(0, 32);
  return `${provider}:refresh:${providerRequestId}:${digest}`;
}
