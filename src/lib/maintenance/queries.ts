import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { DOCUMENTS_BUCKET } from "@/lib/validation/document";

type Tables = Database["public"]["Tables"];

export type RepairRow = Pick<
  Tables["maintenance_requests"]["Row"],
  | "id"
  | "title"
  | "location"
  | "description"
  | "urgency"
  | "status"
  | "created_at"
  | "resolved_at"
  | "room_id"
  | "tenancy_id"
> & {
  maintenance_photos: Pick<Tables["maintenance_photos"]["Row"], "id" | "file_path" | "file_name">[];
};

export type RepairPhoto = { id: string; fileName: string; url: string | null };
export type Repair = Omit<RepairRow, "maintenance_photos"> & { photos: RepairPhoto[] };

const REPAIR_COLUMNS = `id, title, location, description, urgency, status, created_at, resolved_at,
  room_id, tenancy_id, maintenance_photos (id, file_path, file_name)`;

/** How long photo links work: long enough to look through a page of repairs. */
const PHOTO_LINK_LIFETIME = 10 * 60;

/**
 * Repairs, newest first, with short-lived links to their photos. Filter by
 * tenancy (the tenant portal) or by property (staff). RLS decides the rest.
 */
export async function getRepairs(filter: { tenancyId: string } | { propertyId: string }) {
  const supabase = await createClient();
  let query = supabase.from("maintenance_requests").select(REPAIR_COLUMNS);
  query =
    "tenancyId" in filter
      ? query.eq("tenancy_id", filter.tenancyId)
      : query.eq("property_id", filter.propertyId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .overrideTypes<RepairRow[], { merge: false }>();
  if (error) throw new Error("Could not load repairs", { cause: error.code });

  const paths = data.flatMap((repair) => repair.maintenance_photos.map((photo) => photo.file_path));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrls(paths, PHOTO_LINK_LIFETIME);
    for (const link of signed ?? []) {
      if (link.path && link.signedUrl) urls.set(link.path, link.signedUrl);
    }
  }

  return data.map(({ maintenance_photos, ...repair }): Repair => ({
    ...repair,
    photos: maintenance_photos.map((photo) => ({
      id: photo.id,
      fileName: photo.file_name,
      url: urls.get(photo.file_path) ?? null,
    })),
  }));
}
