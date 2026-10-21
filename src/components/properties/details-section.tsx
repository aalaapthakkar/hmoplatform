"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useTransition } from "react";
import { toast } from "sonner";
import { updateDetails } from "@/app/(app)/properties/[propertyId]/actions";
import { Field, FormIdPrefix, useFormValues } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseTags } from "@/lib/validation/property";
import { COMMON_AMENITIES, type DetailsFormValues, detailsSchema } from "@/lib/validation/details";

type DetailsSectionProps = { propertyId: string; initial: DetailsFormValues };

export function DetailsSection({ propertyId, initial }: DetailsSectionProps) {
  const router = useRouter();
  const form = useFormValues(initial);
  const [pending, startTransition] = useTransition();
  const ticked = parseTags(form.values.amenities).map((amenity) => amenity.toLowerCase());

  function toggleAmenity(amenity: string, checked: boolean) {
    const others = parseTags(form.values.amenities).filter(
      (existing) => existing.toLowerCase() !== amenity.toLowerCase(),
    );
    form.set("amenities", (checked ? [...others, amenity] : others).join(", "));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.validate(detailsSchema)) return;
    startTransition(async () => {
      const result = await updateDetails(propertyId, form.values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="details-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="details-heading" className="text-xl font-semibold">
          Details
        </h2>
        <p className="text-sm text-muted-foreground">
          What the property is like and how the house works. Useful for adverts and new tenants.
        </p>
      </div>

      <FormIdPrefix value={form.prefix}>
        <form onSubmit={handleSubmit} noValidate className="flex max-w-2xl flex-col gap-5">
          <Field
            name="description"
            label="Description"
            hint="The layout, the area, transport links."
            error={form.errors.description}
          >
            <Textarea {...form.field("description")} rows={5} />
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">Amenities</legend>
            <div className="grid grid-cols-2 gap-2">
              {COMMON_AMENITIES.map((amenity) => {
                const id = `${form.prefix}amenity-${amenity.replace(/\W+/g, "-").toLowerCase()}`;
                return (
                  <label
                    key={amenity}
                    htmlFor={id}
                    className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={ticked.includes(amenity.toLowerCase())}
                      onChange={(event) => toggleAmenity(amenity, event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    {amenity}
                  </label>
                );
              })}
            </div>
            <Field
              name="otherAmenities"
              label="Other amenities (optional)"
              hint="Separate with commas, like gym, home office."
              error={form.errors.otherAmenities}
            >
              <Input {...form.field("otherAmenities")} autoComplete="off" />
            </Field>
          </fieldset>

          <Field
            name="houseRules"
            label="House rules"
            hint="For example, quiet hours, guests, smoking, bins and cleaning."
            error={form.errors.houseRules}
          >
            <Textarea {...form.field("houseRules")} rows={5} />
          </Field>

          <label
            htmlFor={`${form.prefix}billsIncluded`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
          >
            <input
              id={`${form.prefix}billsIncluded`}
              type="checkbox"
              checked={form.values.billsIncluded === "yes"}
              onChange={(event) => form.set("billsIncluded", event.target.checked ? "yes" : "no")}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Bills included</span>
              <span className="text-muted-foreground">
                Rent covers energy, water, broadband and council tax.
              </span>
            </span>
          </label>

          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Save details"}
            </Button>
          </div>
        </form>
      </FormIdPrefix>
    </section>
  );
}
