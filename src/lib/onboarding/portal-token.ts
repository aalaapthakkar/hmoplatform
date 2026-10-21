import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Applicant links carry a random 256-bit token. Only its SHA-256 hash is
 * stored, the same way the database's portal functions compute it.
 */
export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createPortalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashPortalToken(token) };
}

/** A token as it appears in a link: base64url, 43 characters for 32 bytes. */
export function looksLikePortalToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
