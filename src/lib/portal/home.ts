import { z } from "zod";
import { formatPence } from "@/lib/format";
import { dueDayLabel } from "@/lib/tenancies/status";

const text = z.string().nullable().catch(null);
const list = z.array(z.string()).nullable().catch(null);

/** One of the tenant's tenancies, as tenant_home() returns it: only what a tenant may see. */
const tenantHomeSchema = z.object({
  tenancyId: z.uuid(),
  status: z.enum(["prospective", "active", "ending", "ended"]),
  startDate: z.string(),
  endDate: text,
  rentPence: z.number().int(),
  rentFrequency: z.enum(["monthly", "weekly"]),
  rentDueDay: z.number().int(),
  depositPence: z.number().int(),
  organisation: z.string(),
  roomId: z.uuid(),
  room: z.object({
    name: z.string(),
    sizeSqm: z.coerce.number().nullable().catch(null),
    features: list,
  }),
  property: z.object({
    id: z.uuid(),
    address: z.string(),
    amenities: list,
    houseRules: text,
    billsIncluded: z.boolean().nullable().catch(null),
    welcomePack: text,
  }),
});

export type TenantHome = z.infer<typeof tenantHomeSchema>;

/** Parses tenant_home(), dropping anything malformed rather than failing the page. */
export function parseTenantHomes(json: unknown): TenantHome[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    const parsed = tenantHomeSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const STATUS_ORDER = { active: 0, ending: 0, prospective: 1, ended: 2 } as const;

/**
 * The tenancy the portal shows: the one they live in now, else the one
 * they're moving into, else the most recent one that's ended.
 */
export function primaryHome(homes: TenantHome[]): TenantHome | null {
  return (
    [...homes].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startDate.localeCompare(a.startDate),
    )[0] ?? null
  );
}

/** "£550.00 a month, due on the 1st of the month" or "£130.00 a week, due on Fridays". */
export function rentSummary(home: Pick<TenantHome, "rentPence" | "rentFrequency" | "rentDueDay">) {
  const day = dueDayLabel(home.rentFrequency, home.rentDueDay);
  return home.rentFrequency === "weekly"
    ? `${formatPence(home.rentPence)} a week, due on ${day}`
    : `${formatPence(home.rentPence)} a month, due on the ${day}`;
}
