"use client";

import { Camera, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addRepairPhotos, reportRepair } from "@/app/portal/(tenant)/actions";
import { Choice, Choices, Field, FormIdPrefix, useFormValues } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET, safeFileName } from "@/lib/validation/document";
import {
  ACCEPTED_PHOTOS,
  MAX_REPAIR_PHOTOS,
  photoContentType,
  photoProblem,
  type RepairFormValues,
  repairSchema,
  URGENCY_HINTS,
  URGENCY_LABELS,
} from "@/lib/validation/maintenance";

const URGENCIES = ["low", "normal", "urgent", "emergency"] as const;

export function RepairForm() {
  const router = useRouter();
  const form = useFormValues<RepairFormValues>({
    title: "",
    location: "",
    description: "",
    urgency: "normal",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function choosePhotos(files: FileList | null) {
    if (!files) return;
    const chosen = [...files];
    const problem = chosen.map(photoProblem).find(Boolean) ?? null;
    const room = MAX_REPAIR_PHOTOS - photos.length;
    setPhotoError(
      problem ?? (chosen.length > room ? `You can add up to ${MAX_REPAIR_PHOTOS} photos.` : null),
    );
    setPhotos((current) => [
      ...current,
      ...chosen.filter((file) => !photoProblem(file)).slice(0, room),
    ]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = form.validate(repairSchema);
    if (!data) return;
    startTransition(async () => {
      const result = await reportRepair(form.values);
      if (result.status === "error" || !result.requestId || !result.folder) {
        toast.error(result.message);
        return;
      }

      // Photos go straight to private storage; only this repair's folder is allowed.
      const storage = createClient().storage.from(DOCUMENTS_BUCKET);
      const uploaded: { path: string; fileName: string }[] = [];
      for (const photo of photos) {
        const path = `${result.folder}${crypto.randomUUID()}-${safeFileName(photo.name)}`;
        const { error } = await storage.upload(path, photo, {
          contentType: photoContentType(photo) ?? undefined,
        });
        if (!error) uploaded.push({ path, fileName: photo.name.slice(0, 200) });
      }
      const recorded =
        uploaded.length > 0
          ? (await addRepairPhotos(result.requestId, uploaded)).status === "success"
          : true;

      if (uploaded.length < photos.length || !recorded) {
        toast.warning("Repair reported, but some photos didn't upload. Send them in Messages.");
      } else {
        toast.success(result.message);
      }
      router.push("/portal/repairs");
      router.refresh();
    });
  }

  return (
    <FormIdPrefix value={form.prefix}>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5"
        aria-label="Report a repair"
      >
        <Field name="title" label="What needs fixing?" error={form.errors.title}>
          <Input {...form.field("title")} placeholder="For example, the shower is leaking" />
        </Field>
        <Field
          name="location"
          label="Where is it? (optional)"
          error={form.errors.location}
          hint="For example, your room, the kitchen or the first floor bathroom."
        >
          <Input {...form.field("location")} />
        </Field>
        <Field
          name="description"
          label="Tell us more"
          error={form.errors.description}
          hint="When it started, what you've noticed, and when we can get in."
        >
          <Textarea {...form.field("description")} rows={5} />
        </Field>

        <Choices legend="How urgent is it?" name="urgency" error={form.errors.urgency}>
          {URGENCIES.map((urgency) => (
            <Choice
              key={urgency}
              name="urgency"
              value={urgency}
              checked={form.values.urgency === urgency}
              onChange={() => form.set("urgency", urgency)}
              title={URGENCY_LABELS[urgency]}
              description={URGENCY_HINTS[urgency]}
            />
          ))}
        </Choices>
        {form.values.urgency === "emergency" ? (
          <p
            role="note"
            className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50"
          >
            If you smell gas, call the National Gas Emergency line on 0800 111 999 straight away. If
            anyone is in danger, call 999. Then report it here too.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Photos (optional, up to {MAX_REPAIR_PHOTOS})</span>
          {photos.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Photos to send">
              {photos.map((photo, index) => (
                <li
                  key={`${photo.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <span className="truncate">{photo.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${photo.name}`}
                    onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {photos.length < MAX_REPAIR_PHOTOS ? (
            <div>
              <input
                ref={fileInput}
                id={`${form.prefix}photos`}
                type="file"
                accept={ACCEPTED_PHOTOS}
                multiple
                className="sr-only"
                onChange={(event) => choosePhotos(event.target.files)}
                aria-describedby={photoError ? `${form.prefix}photos-error` : undefined}
              />
              <label
                htmlFor={`${form.prefix}photos`}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted has-focus-visible:ring-3"
              >
                <Camera className="size-4" aria-hidden />
                Add photos
              </label>
            </div>
          ) : null}
          {photoError ? (
            <p id={`${form.prefix}photos-error`} className="text-xs text-destructive">
              {photoError}
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send repair report"}
        </Button>
      </form>
    </FormIdPrefix>
  );
}
