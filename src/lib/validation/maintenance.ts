import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { MAX_FILE_BYTES } from "./document";

type Enums = Database["public"]["Enums"];

export const URGENCY_LABELS: Record<Enums["maintenance_urgency"], string> = {
  low: "Not urgent",
  normal: "Soon",
  urgent: "Urgent",
  emergency: "Emergency",
};

/** What each urgency means, for tenants choosing one. */
export const URGENCY_HINTS: Record<Enums["maintenance_urgency"], string> = {
  low: "It can wait a few weeks, like a sticking drawer.",
  normal: "It needs fixing in the next week or two.",
  urgent: "It's affecting daily life, like no hot water or a broken lock.",
  emergency:
    "Danger to people or the building, like a gas smell, flooding or no heating in winter.",
};

export const MAINTENANCE_STATUS_LABELS: Record<Enums["maintenance_status"], string> = {
  reported: "Reported",
  in_progress: "In progress",
  done: "Fixed",
  closed: "Closed",
};

export const MAX_REPAIR_PHOTOS = 5;

export type RepairFormValues = {
  title: string;
  location: string;
  description: string;
  urgency: string;
};

export const repairSchema = z.object({
  title: z.string().trim().min(1, "Say what needs fixing").max(120, "Use 120 characters or fewer"),
  location: z
    .string()
    .trim()
    .max(120, "Use 120 characters or fewer")
    .transform((value) => value || null),
  description: z
    .string()
    .trim()
    .min(1, "Describe the problem")
    .max(4000, "Use 4,000 characters or fewer"),
  urgency: z.enum(["low", "normal", "urgent", "emergency"], "Choose how urgent it is"),
});

const PHOTO_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};
const ALLOWED_PHOTO_TYPES = new Set(Object.values(PHOTO_TYPES));
export const ACCEPTED_PHOTOS = Object.keys(PHOTO_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

/** The photo's content type, or null if it isn't one we accept (HEIC can arrive untyped). */
export function photoContentType(file: { name: string; type: string }): string | null {
  if (ALLOWED_PHOTO_TYPES.has(file.type)) return file.type;
  if (file.type && file.type !== "application/octet-stream") return null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return PHOTO_TYPES[extension] ?? null;
}

/** Why a photo can't be added, or null if it's fine. */
export function photoProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return `${file.name} is empty. Choose another photo.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 20 MB. Choose a smaller photo.`;
  if (!photoContentType(file)) return `${file.name} isn't a photo. Use JPG, PNG or HEIC.`;
  return null;
}

/** Where a repair's photos live: <org>/maintenance/<request>/. */
export function repairFolder(orgId: string, requestId: string) {
  return `${orgId}/maintenance/${requestId}/`;
}

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first")
    .max(4000, "Use 4,000 characters or fewer"),
});
