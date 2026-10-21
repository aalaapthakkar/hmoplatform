import {
  applyEsignEvent,
  EsignNotConfigured,
  type EsignProvider,
  getEsignProvider,
} from "@/lib/esign";

/**
 * Where the e-sign provider reports progress. The provider's signature is
 * checked first; then the change goes through the one locked-down
 * database function. No user session, and no Supabase secret key.
 */
export async function POST(request: Request) {
  let provider: EsignProvider;
  try {
    provider = getEsignProvider();
  } catch (error) {
    if (error instanceof EsignNotConfigured) return new Response("Not set up", { status: 503 });
    throw error;
  }

  const result = await provider.verifyWebhook(request);
  if (!result.verified) return new Response("Not verified", { status: 401 });
  if (result.event) await applyEsignEvent(provider.name, result.event);
  return result.acknowledge();
}
