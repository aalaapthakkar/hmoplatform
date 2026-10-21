"use client";

import { Mail, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { setOwnership } from "@/app/(app)/properties/[propertyId]/actions";
import { useFormValues } from "@/components/forms/fields";
import {
  defaultOwnerMode,
  OwnershipFields,
  type OwnershipValues,
} from "@/components/properties/ownership-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ownershipSchema } from "@/lib/validation/property";

export type CurrentOwner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type OwnershipSectionProps = {
  propertyId: string;
  ownershipLabel: string;
  headRent: string | null;
  owner: CurrentOwner | null;
  initial: OwnershipValues;
  owners: { id: string; name: string }[];
};

export function OwnershipSection({
  propertyId,
  ownershipLabel,
  headRent,
  owner,
  initial,
  owners,
}: OwnershipSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const form = useFormValues(initial);
  const [pending, startTransition] = useTransition();

  function chooseOwnership(ownershipType: string) {
    form.setValues((current) => ({
      ...current,
      ownershipType,
      // Keep the current owner selected when switching between managed and master lease.
      ownerMode:
        current.ownerMode === "existing" && current.ownerId
          ? "existing"
          : defaultOwnerMode(ownershipType, owners.length > 0),
    }));
    form.setErrors({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.validate(ownershipSchema)) return;
    startTransition(async () => {
      const result = await setOwnership(propertyId, form.values);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="ownership-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="ownership-heading" className="text-xl font-semibold">
            Ownership
          </h2>
          <p className="text-sm text-muted-foreground">
            How you hold this property and who the landlord is.
          </p>
        </div>
        {editing ? null : (
          <Button size="lg" variant="outline" onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </div>

      {editing ? (
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <OwnershipFields
                values={form.values}
                errors={form.errors}
                field={form.field}
                set={form.set}
                onChooseOwnership={chooseOwnership}
                owners={owners}
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? "Saving…" : "Save ownership"}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    form.setValues(initial);
                    form.setErrors({});
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">How you hold it</dt>
              <dd className="font-medium">{ownershipLabel}</dd>

              {owner ? (
                <>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="flex flex-col gap-1">
                    <span className="font-medium">{owner.name}</span>
                    {owner.email ? (
                      <a
                        href={`mailto:${owner.email}`}
                        className="flex items-center gap-1.5 break-all text-muted-foreground underline-offset-4 hover:underline"
                      >
                        <Mail className="size-3.5 shrink-0" aria-hidden />
                        {owner.email}
                      </a>
                    ) : null}
                    {owner.phone ? (
                      <a
                        href={`tel:${owner.phone.replace(/\s+/g, "")}`}
                        className="flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:underline"
                      >
                        <Phone className="size-3.5 shrink-0" aria-hidden />
                        {owner.phone}
                      </a>
                    ) : null}
                  </dd>
                </>
              ) : null}

              {headRent ? (
                <>
                  <dt className="text-muted-foreground">Head rent</dt>
                  <dd className="font-medium">{headRent}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
