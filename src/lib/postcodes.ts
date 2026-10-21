import { z } from "zod";
import { isValidPostcode, normalisePostcode } from "@/lib/validation/property";

/** postcodes.io: free, open UK postcode data (ONS). No key needed; only the postcode is sent. */
export const POSTCODES_API = "https://api.postcodes.io/postcodes";

const responseSchema = z.object({
  result: z.object({
    postcode: z.string(),
    admin_district: z.string().nullable(),
    region: z.string().nullable(),
  }),
});

export type PostcodeDetails = {
  postcode: string;
  /** A suggestion only: postcodes.io has the council area, not the postal town. */
  town: string | null;
  council: string | null;
};

/**
 * Looks up a postcode's council area, and suggests a town from it. Returns
 * null when the postcode is unknown or the service can't be reached, so the
 * caller can let the user type the details instead.
 */
export async function lookupPostcode(
  postcode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PostcodeDetails | null> {
  if (!isValidPostcode(postcode)) return null;

  try {
    const response = await fetchImpl(
      `${POSTCODES_API}/${encodeURIComponent(normalisePostcode(postcode))}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return null;

    const { result } = parsed.data;
    // London postcodes sit in a borough ("Camden"), but the town is London.
    const town = result.region === "London" ? "London" : result.admin_district;
    return { postcode: result.postcode, town, council: result.admin_district };
  } catch {
    return null;
  }
}
