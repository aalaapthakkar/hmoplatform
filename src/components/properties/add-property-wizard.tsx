"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createProperty } from "@/app/(app)/properties/new/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupPostcode } from "@/lib/postcodes";
import { cn } from "@/lib/utils";
import {
  addressStepSchema,
  isValidPostcode,
  normalisePostcode,
  parseTags,
  type PropertyWizardValues,
  relationshipStepSchema,
  rentalStepSchema,
} from "@/lib/validation/property";

type Owner = { id: string; name: string };
type Errors = Partial<Record<keyof PropertyWizardValues, string[]>>;

const STEPS = [
  { title: "Address", schema: addressStepSchema, firstField: "postcode" },
  { title: "Rental type", schema: rentalStepSchema, firstField: "roomCount" },
  { title: "Relationship", schema: relationshipStepSchema, firstField: "ownershipType-owned" },
] as const;

const PROPERTY_TYPE_LABELS = {
  house: "House",
  flat: "Flat",
  maisonette: "Maisonette",
  bungalow: "Bungalow",
  other: "Other",
} as const;

type LookupState =
  | { status: "idle" }
  | { status: "looking" }
  | { status: "found"; council: string | null }
  | { status: "not-found" };

const initialValues: PropertyWizardValues = {
  postcode: "",
  addressLine1: "",
  addressLine2: "",
  town: "",
  council: "",
  propertyType: "house",
  lettingType: "house_share",
  roomCount: "",
  roomRent: "",
  ownershipType: "",
  headRent: "",
  ownerMode: "",
  ownerId: "",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  tags: "",
};

type AddPropertyWizardProps = {
  owners: Owner[];
  existingTags: string[];
};

/**
 * Three short steps: address (postcode first), rental type and relationship.
 * Each step is checked before moving on, and everything again on the server.
 */
export function AddPropertyWizard({ owners, existingTags }: AddPropertyWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  // Town and council the user hasn't typed over, so a new postcode can refill them.
  const suggested = useRef({ town: "", council: "" });
  const latestLookup = useRef("");
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const firstField = STEPS[step]?.firstField;
    if (firstField) document.getElementById(firstField)?.focus();
  }, [step]);

  function set<K extends keyof PropertyWizardValues>(name: K, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function field(name: keyof PropertyWizardValues) {
    const error = errors[name]?.[0];
    return {
      id: name,
      name,
      value: values[name],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        set(name, event.target.value),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": [error ? `${name}-error` : null, `${name}-hint`].join(" "),
    };
  }

  async function findPostcode() {
    const postcode = values.postcode;
    if (!isValidPostcode(postcode)) return;
    set("postcode", normalisePostcode(postcode));
    latestLookup.current = postcode;
    setLookup({ status: "looking" });

    const details = await lookupPostcode(postcode);
    if (latestLookup.current !== postcode) return; // a newer lookup has started
    if (!details) {
      setLookup({ status: "not-found" });
      return;
    }

    setLookup({ status: "found", council: details.council });
    setValues((current) => {
      const next = { ...current, postcode: details.postcode };
      if (details.town && (!current.town || current.town === suggested.current.town)) {
        next.town = details.town;
        suggested.current.town = details.town;
      }
      if (details.council && (!current.council || current.council === suggested.current.council)) {
        next.council = details.council;
        suggested.current.council = details.council;
      }
      return next;
    });
  }

  function chooseOwnership(ownershipType: string) {
    setValues((current) => ({
      ...current,
      ownershipType,
      // Start from the likeliest owner choice for each kind of property.
      ownerMode: ownershipType === "master_lease" ? "none" : owners.length > 0 ? "existing" : "new",
    }));
    setErrors({});
  }

  function addTag(tag: string) {
    const tags = parseTags(values.tags);
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    set("tags", [...tags, tag].join(", "));
  }

  function validate(stepIndex: number) {
    const schema: z.ZodType = STEPS[stepIndex]!.schema;
    const result = schema.safeParse(values);
    if (result.success) return true;
    setErrors(z.flattenError(result.error).fieldErrors as Errors);
    return false;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!validate(step)) return;

    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }

    startTransition(async () => {
      const result = await createProperty(values);
      if (result.status === "error") {
        setFormError(result.message);
        return;
      }
      toast.success(result.message);
      router.push("/properties");
    });
  }

  const houseShare = values.lettingType === "house_share";
  const hasOwner = values.ownershipType === "managed" || values.ownershipType === "master_lease";
  const tagsInUse = parseTags(values.tags).map((tag) => tag.toLowerCase());
  const tagSuggestions = existingTags.filter((tag) => !tagsInUse.includes(tag.toLowerCase()));

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <ol className="flex gap-2 text-sm" aria-label="Steps">
        {STEPS.map((item, index) => (
          <li
            key={item.title}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "flex flex-1 flex-col gap-1.5 border-t-4 pt-2",
              index <= step ? "border-primary" : "border-muted",
              index === step ? "font-medium" : "text-muted-foreground",
            )}
          >
            <span className="text-xs text-muted-foreground">Step {index + 1}</span>
            {item.title}
          </li>
        ))}
      </ol>

      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="step-heading">
          <h2 id="step-heading" className="text-lg font-semibold">
            Where is it?
          </h2>
          <Field
            name="postcode"
            label="Postcode"
            error={errors.postcode}
            hint={<LookupMessage lookup={lookup} />}
          >
            <Input
              {...field("postcode")}
              autoFocus
              autoComplete="postal-code"
              onBlur={findPostcode}
              className="max-w-40 uppercase"
            />
          </Field>
          <Field name="addressLine1" label="Address line 1" error={errors.addressLine1}>
            <Input {...field("addressLine1")} autoComplete="address-line1" />
          </Field>
          <Field
            name="addressLine2"
            label="Address line 2 (optional)"
            hint="For example, the area of town."
            error={errors.addressLine2}
          >
            <Input {...field("addressLine2")} autoComplete="address-line2" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="town" label="Town or city" error={errors.town}>
              <Input {...field("town")} autoComplete="address-level2" />
            </Field>
            <Field
              name="council"
              label="Council (optional)"
              hint="The local council that licenses HMOs here."
              error={errors.council}
            >
              <Input {...field("council")} />
            </Field>
          </div>
          <Field name="propertyType" label="Type of property" error={errors.propertyType}>
            <select {...field("propertyType")} className={selectClass}>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="flex flex-col gap-4" aria-labelledby="step-heading">
          <h2 id="step-heading" className="text-lg font-semibold">
            How is it let?
          </h2>
          <Choices legend="Rental type" name="lettingType" error={errors.lettingType}>
            <Choice
              name="lettingType"
              value="house_share"
              checked={houseShare}
              onChange={() => set("lettingType", "house_share")}
              title="House share"
              description="Rooms let separately to different tenants."
            />
            <Choice
              name="lettingType"
              value="single_let"
              checked={values.lettingType === "single_let"}
              onChange={() => set("lettingType", "single_let")}
              title="Single let"
              description="The whole property let to one household."
            />
          </Choices>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="roomCount"
              label={houseShare ? "Number of rooms" : "Number of bedrooms"}
              hint={
                houseShare
                  ? "We'll create Room 1, Room 2 and so on. You can rename them later."
                  : "We'll set it up as one unit called Whole property."
              }
              error={errors.roomCount}
            >
              <Input
                {...field("roomCount")}
                inputMode="numeric"
                autoComplete="off"
                className="max-w-28"
              />
            </Field>
            <Field
              name="roomRent"
              label={houseShare ? "Usual rent per room (optional)" : "Rent (optional)"}
              hint="Pounds per month. You can change it later."
              error={errors.roomRent}
            >
              <PoundsInput {...field("roomRent")} />
            </Field>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-4" aria-labelledby="step-heading">
          <h2 id="step-heading" className="text-lg font-semibold">
            How do you hold it?
          </h2>
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

          <Field
            name="tags"
            label="Tags (optional)"
            hint="Separate tags with commas, like students, licensed HMO. Properties are grouped by tag."
            error={errors.tags}
          >
            <Input {...field("tags")} autoComplete="off" />
          </Field>
          {tagSuggestions.length > 0 ? (
            <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Add a tag you use:</span>
              {tagSuggestions.slice(0, 8).map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => addTag(tag)}
                >
                  {tag}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" size="lg" disabled={pending}>
          {step < STEPS.length - 1 ? "Next" : pending ? "Adding…" : "Add property"}
        </Button>
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => {
              setErrors({});
              setStep(step - 1);
            }}
          >
            Back
          </Button>
        ) : null}
        <Link href="/properties" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      <div id={`${name}-hint`} className="text-xs text-muted-foreground empty:hidden">
        {hint}
      </div>
      {error?.[0] ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

function PoundsInput(props: ComponentProps<typeof Input>) {
  return (
    <div className="flex max-w-40 items-center gap-1.5">
      <span aria-hidden className="text-muted-foreground">
        £
      </span>
      <Input {...props} inputMode="decimal" autoComplete="off" />
    </div>
  );
}

function Choices({
  legend,
  name,
  error,
  children,
}: {
  legend: string;
  name: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error?.[0] ? `${name}-error` : undefined}
    >
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">{children}</div>
      {error?.[0] ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : null}
    </fieldset>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50",
        "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
      )}
    >
      <input
        id={`${name}-${value}`}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? <span className="text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

function LookupMessage({ lookup }: { lookup: LookupState }) {
  const message =
    lookup.status === "looking"
      ? "Looking up the postcode…"
      : lookup.status === "found"
        ? `Found it${lookup.council ? ` in ${lookup.council}` : ""}. We've filled in the town and council for you to check.`
        : lookup.status === "not-found"
          ? "We couldn't look that postcode up. Type the town and council yourself."
          : "We'll fill in the town and council from it.";
  return <span aria-live="polite">{message}</span>;
}
