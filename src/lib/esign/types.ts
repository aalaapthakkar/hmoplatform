/**
 * The e-signature provider interface. The app only talks to providers
 * through this, so one can be swapped for another.
 */

export type SignerRole = "tenant" | "guarantor" | "organisation";

export type EsignSigner = { role: SignerRole; name: string; email: string; order: number };

export type SendInput = {
  title: string;
  subject: string;
  message: string;
  fileName: string;
  pdf: Uint8Array;
  signers: EsignSigner[];
  /** Small strings the provider keeps with the request, such as our ids. */
  metadata: Record<string, string>;
};

export type RequestStatus =
  "sent" | "partly_signed" | "completed" | "declined" | "cancelled" | "error";

export type ProviderStatus = {
  requestStatus: RequestStatus;
  signers: { email: string; status: "awaiting" | "signed" | "declined"; signedAt?: string }[];
};

/** A verified provider event, ready to apply. */
export type ProviderEvent = {
  providerRequestId: string;
  /** Unique per event, to ignore replays. */
  eventKey: string;
  eventType: string;
  eventTime: string;
  status: ProviderStatus;
};

export type WebhookResult =
  /** The request didn't come from the provider. */
  | { verified: false }
  /** Verified; event is null for events with nothing to apply (such as a test ping). */
  | { verified: true; event: ProviderEvent | null; acknowledge: () => Response };

export interface EsignProvider {
  readonly name: string;
  send(input: SendInput): Promise<{ providerRequestId: string }>;
  getStatus(providerRequestId: string): Promise<ProviderStatus>;
  cancel(providerRequestId: string): Promise<void>;
  /** The completed, signed PDF. Throws EsignNotReady if the provider is still preparing it. */
  downloadSigned(providerRequestId: string): Promise<Uint8Array>;
  verifyWebhook(request: Request): Promise<WebhookResult>;
}

export class EsignError extends Error {}

/** The signed file isn't ready yet: try again in a minute. */
export class EsignNotReady extends EsignError {}

/** No provider is set up, for example a missing test API key. */
export class EsignNotConfigured extends EsignError {}

/** The overall status from each signer's status, the same way for every provider. */
export function overallStatus(
  signers: ProviderStatus["signers"],
  flags: { declined?: boolean; error?: boolean; cancelled?: boolean } = {},
): RequestStatus {
  if (flags.cancelled) return "cancelled";
  if (flags.error) return "error";
  if (flags.declined || signers.some((signer) => signer.status === "declined")) return "declined";
  if (signers.length > 0 && signers.every((signer) => signer.status === "signed")) {
    return "completed";
  }
  if (signers.some((signer) => signer.status === "signed")) return "partly_signed";
  return "sent";
}
