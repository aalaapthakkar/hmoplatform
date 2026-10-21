"use client";

import {
  Choice,
  Choices,
  Field,
  type FieldProps,
  PoundsInput,
  selectClass,
} from "@/components/forms/fields";
import { Input } from "@/components/ui/input";

export type OwnershipValues = {
  ownershipType: string;
  headRent: string;
  ownerMode: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
};

/** The likeliest owner choice for each way of holding a property. */
export function defaultOwnerMode(ownershipType: string, hasOwners: boolean) {
  return ownershipType === "master_lease" ? "none" : hasOwners ? "existing" : "new";
}

type OwnershipFieldsProps = {
  values: OwnershipValues;
  errors: Partial<Record<keyof OwnershipValues, string[]>>;
  field: (name: keyof OwnershipValues) => FieldProps;
  set: (name: keyof OwnershipValues, value: string) => void;
  onChooseOwnership: (ownershipType: string) => void;
  owners: { id: string; name: string }[];
};

/**
 * Owned, managed for an owner or master lease, with the owner (existing or
 * new) and the head rent. Used by the Add property wizard and the Ownership section.
 */
export function OwnershipFields({
  values,
  errors,
  field,
  set,
  onChooseOwnership: chooseOwnership,
  owners,
}: OwnershipFieldsProps) {
  const hasOwner = values.ownershipType === "managed" || values.ownershipType === "master_lease";

  return (
    <>
      <Choices legend="Relationship" name="ownershipType" error={errors.ownershipType}>
        <Choice
          name="ownershipType"
          value="owned"
          checked={values.ownershipType === "owned"}
          onChange={() => chooseOwnership("owned")}
          title="Owned"
          description="You or your company own it."
        />
        <Choice
          name="ownershipType"
          value="managed"
          checked={values.ownershipType === "managed"}
          onChange={() => chooseOwnership("managed")}
          title="Managed for an owner"
          description="You let and manage it for the landlord."
        />
        <Choice
          name="ownershipType"
          value="master_lease"
          checked={values.ownershipType === "master_lease"}
          onChange={() => chooseOwnership("master_lease")}
          title="Master lease"
          description="You rent it from the landlord and let the rooms yourself (rent to rent)."
        />
      </Choices>

      {values.ownershipType === "master_lease" ? (
        <Field
          name="headRent"
          label="Head rent"
          hint="What you pay the landlord, in pounds per month."
          error={errors.headRent}
        >
          <PoundsInput {...field("headRent")} />
        </Field>
      ) : null}

      {hasOwner ? (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <Choices
            legend={values.ownershipType === "managed" ? "Owner" : "Landlord"}
            name="ownerMode"
            error={errors.ownerMode}
          >
            {values.ownershipType === "master_lease" ? (
              <Choice
                name="ownerMode"
                value="none"
                checked={values.ownerMode === "none"}
                onChange={() => set("ownerMode", "none")}
                title="Add later"
              />
            ) : null}
            {owners.length > 0 ? (
              <Choice
                name="ownerMode"
                value="existing"
                checked={values.ownerMode === "existing"}
                onChange={() => set("ownerMode", "existing")}
                title="Someone you've added before"
              />
            ) : null}
            <Choice
              name="ownerMode"
              value="new"
              checked={values.ownerMode === "new"}
              onChange={() => set("ownerMode", "new")}
              title="Someone new"
            />
          </Choices>

          {values.ownerMode === "existing" ? (
            <Field name="ownerId" label="Choose the owner" error={errors.ownerId}>
              <select {...field("ownerId")} className={selectClass}>
                <option value="">Choose…</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {values.ownerMode === "new" ? (
            <>
              <Field
                name="ownerName"
                label="Name"
                hint="A person or a company."
                error={errors.ownerName}
              >
                <Input {...field("ownerName")} autoComplete="off" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="ownerEmail" label="Email (optional)" error={errors.ownerEmail}>
                  <Input {...field("ownerEmail")} type="email" autoComplete="off" />
                </Field>
                <Field name="ownerPhone" label="Phone (optional)" error={errors.ownerPhone}>
                  <Input {...field("ownerPhone")} type="tel" autoComplete="off" />
                </Field>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
