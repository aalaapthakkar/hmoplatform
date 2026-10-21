"use server";

import type { ActionResult } from "@/app/(app)/properties/[propertyId]/actions";
import { requireMembership } from "@/lib/auth/session";
import { applyEsignEvent, EsignError, getFakeProvider } from "@/lib/esign";

/** Signs as one person with the pretend provider, then applies the event like a webhook would. */
export async function fakeSign(requestId: string, email: string): Promise<ActionResult> {
  await requireMembership();
  const provider = getFakeProvider();
  if (!provider) return { status: "error", message: "The pretend provider isn't switched on." };
  try {
    const event = await provider.sign(requestId, email);
    await applyEsignEvent(provider.name, event);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof EsignError ? error.message : "Couldn't sign.",
    };
  }
  return { status: "success", message: "Signed." };
}
