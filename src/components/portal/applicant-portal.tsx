"use client";

import { createClient } from "@supabase/supabase-js";
import { Check, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordUpload, saveApplication } from "@/app/apply/[token]/actions";
import {
  Choice,
  Choices,
  Field,
  type FieldErrors,
  FormIdPrefix,
  PoundsInput,
  selectClass,
  useFormValues,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicEnv } from "@/lib/env";
import { formatUkDate } from "@/lib/format";
import type { PortalOverview } from "@/lib/onboarding/portal";
import { applicantStepLabel } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";
import {
  type ApplicationValues,
  EMPLOYMENT_STATUSES,
  latestAdultBirthDate,
  TIME_AT_ADDRESS,
} from "@/lib/validation/application";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENTS_BUCKET,
  fileContentType,
  fileProblem,
  safeFileName,
} from "@/lib/validation/document";

const UPLOAD_TYPES = {
  identity: "Photo ID (passport or driving licence)",
  right_to_rent: "Right to rent proof (for example a share code letter)",
  proof_of_income: "Proof of income (payslip, contract or student loan letter)",
  other: "Something else",
} as const;

/**
 * Uploads go straight to the private bucket as a signed-out visitor, never
 * with a staff session that might be in the same browser. Storage only lets
 * them add files to this applicant's own folder.
 */
function anonymousStorage() {
  const env = getPublicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(DOCUMENTS_BUCKET);
}

export function ApplicantPortal({
  token,
  overview,
  initialAnswers,
}: {
  token: string;
  overview: PortalOverview;
  initialAnswers: ApplicationValues;
}) {
  const submitted = overview.submittedAt !== null;

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{overview.organisation}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi{overview.firstName ? ` ${overview.firstName}` : ""}, welcome
        </h1>
        <p className="text-muted-foreground">
          {overview.room ? `${overview.room}, ` : ""}
          {overview.address}
          {overview.moveInDate ? `. Moving in ${formatUkDate(overview.moveInDate)}.` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          This private link works until {formatUkDate(overview.expiresAt)}. Please don&apos;t share
          it.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="font-semibold">Your progress</h2>
          <ol className="flex flex-col gap-2" aria-label="Progress">
            {overview.steps.map((step, index) => {
              const label = applicantStepLabel(step.status, step.yours);
              const done = step.status === "done" || step.status === "skipped";
              return (
                <li
                  key={index}
                  className="flex items-center gap-3 text-sm"
                  data-testid="portal-step"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      done && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="flex-1">{step.title}</span>
                  <span
                    className={cn(
                      "text-xs",
                      label === "Your turn" ? "font-medium text-primary" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {submitted ? (
        <Card data-testid="application-sent">
          <CardContent className="flex flex-col gap-1">
            <h2 className="font-semibold">Application sent</h2>
            <p className="text-sm text-muted-foreground">
              Thanks, we&apos;ve got it. We&apos;ll be in touch about the next steps.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ApplicationForm token={token} initial={initialAnswers} />
      )}

      <Uploads token={token} folder={overview.uploadFolder} documents={overview.documents} />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-1 font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

function YesNo({
  name,
  legend,
  value,
  onChange,
  error,
}: {
  name: keyof ApplicationValues;
  legend: string;
  value: string;
  onChange: (value: string) => void;
  error?: string[];
}) {
  return (
    <Choices legend={legend} name={name} error={error}>
      <Choice
        name={name}
        value="yes"
        checked={value === "yes"}
        onChange={() => onChange("yes")}
        title="Yes"
      />
      <Choice
        name={name}
        value="no"
        checked={value === "no"}
        onChange={() => onChange("no")}
        title="No"
      />
    </Choices>
  );
}

function ApplicationForm({ token, initial }: { token: string; initial: ApplicationValues }) {
  const router = useRouter();
  const form = useFormValues(initial);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const { values } = form;
  const working =
    values.employmentStatus === "employed" || values.employmentStatus === "self_employed";
  const studying = values.employmentStatus === "student";

  function save(submit: boolean) {
    setProblem(null);
    startTransition(async () => {
      const result = await saveApplication(token, values, submit);
      if (result.status === "error") {
        setProblem(result.message);
        if (result.fieldErrors)
          form.setErrors(result.fieldErrors as FieldErrors<ApplicationValues>);
        return;
      }
      form.setErrors({});
      toast.success(result.message);
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(true);
  }

  return (
    <Card>
      <CardContent>
        <FormIdPrefix value={form.prefix}>
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-5"
            aria-label="Application"
          >
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">Your application</h2>
              <p className="text-sm text-muted-foreground">
                It takes about 10 minutes. You can save it and come back.
              </p>
            </div>

            {problem ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {problem}
              </p>
            ) : null}

            <Section title="About you">
              <Field
                name="legalName"
                label="Full legal name"
                hint="As it appears on your ID."
                error={form.errors.legalName}
              >
                <Input {...form.field("legalName")} autoComplete="name" />
              </Field>
              <Field name="dateOfBirth" label="Date of birth" error={form.errors.dateOfBirth}>
                <Input
                  {...form.field("dateOfBirth")}
                  type="date"
                  max={latestAdultBirthDate()}
                  className="max-w-48"
                />
              </Field>
              <Field name="email" label="Email" error={form.errors.email}>
                <Input {...form.field("email")} type="email" autoComplete="email" />
              </Field>
              <Field name="phone" label="Mobile number" error={form.errors.phone}>
                <Input {...form.field("phone")} type="tel" autoComplete="tel" />
              </Field>
            </Section>

            <Section title="Where you live now">
              <Field name="currentAddress" label="Address" error={form.errors.currentAddress}>
                <Input {...form.field("currentAddress")} autoComplete="street-address" />
              </Field>
              <Field name="currentPostcode" label="Postcode" error={form.errors.currentPostcode}>
                <Input
                  {...form.field("currentPostcode")}
                  autoComplete="postal-code"
                  className="max-w-40 uppercase"
                />
              </Field>
              <Field
                name="timeAtAddress"
                label="How long you've lived there"
                error={form.errors.timeAtAddress}
              >
                <select {...form.field("timeAtAddress")} className={selectClass}>
                  <option value="">Choose…</option>
                  {Object.entries(TIME_AT_ADDRESS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title="Work and income">
              <Field
                name="employmentStatus"
                label="What do you do?"
                error={form.errors.employmentStatus}
              >
                <select {...form.field("employmentStatus")} className={selectClass}>
                  <option value="">Choose…</option>
                  {Object.entries(EMPLOYMENT_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {working || studying ? (
                <Field
                  name="employerOrPlace"
                  label={studying ? "Where you study" : "Employer or business"}
                  error={form.errors.employerOrPlace}
                >
                  <Input {...form.field("employerOrPlace")} autoComplete="organization" />
                </Field>
              ) : null}
              <Field
                name="annualIncome"
                label={working ? "Yearly income before tax" : "Yearly income (optional)"}
                hint="Including any student loan or benefits."
                error={form.errors.annualIncome}
              >
                <PoundsInput {...form.field("annualIncome")} />
              </Field>
            </Section>

            <Section title="Guarantor">
              <YesNo
                name="hasGuarantor"
                legend="Do you have a guarantor?"
                value={values.hasGuarantor}
                onChange={(value) => form.set("hasGuarantor", value)}
                error={form.errors.hasGuarantor}
              />
              {values.hasGuarantor === "yes" ? (
                <>
                  <Field
                    name="guarantorName"
                    label="Guarantor's name"
                    error={form.errors.guarantorName}
                  >
                    <Input {...form.field("guarantorName")} autoComplete="off" />
                  </Field>
                  <Field
                    name="guarantorEmail"
                    label="Guarantor's email"
                    error={form.errors.guarantorEmail}
                  >
                    <Input {...form.field("guarantorEmail")} type="email" autoComplete="off" />
                  </Field>
                </>
              ) : null}
            </Section>

            <Section title="Emergency contact">
              <Field name="emergencyName" label="Name" error={form.errors.emergencyName}>
                <Input {...form.field("emergencyName")} autoComplete="off" />
              </Field>
              <Field name="emergencyPhone" label="Phone number" error={form.errors.emergencyPhone}>
                <Input {...form.field("emergencyPhone")} type="tel" autoComplete="off" />
              </Field>
            </Section>

            <Section title="Right to rent">
              <Field
                name="shareCode"
                label="Home Office share code (optional)"
                hint="If you have one, it's 9 letters and numbers. You can get it from GOV.UK. We'll check your ID either way."
                error={form.errors.shareCode}
              >
                <Input
                  {...form.field("shareCode")}
                  autoComplete="off"
                  className="max-w-48 uppercase"
                />
              </Field>
            </Section>

            <Section title="Living in the house">
              <YesNo
                name="smoker"
                legend="Do you smoke?"
                value={values.smoker}
                onChange={(value) => form.set("smoker", value)}
                error={form.errors.smoker}
              />
              <YesNo
                name="pets"
                legend="Do you have pets?"
                value={values.pets}
                onChange={(value) => form.set("pets", value)}
                error={form.errors.pets}
              />
              {values.pets === "yes" ? (
                <Field name="petDetails" label="About your pets" error={form.errors.petDetails}>
                  <Input {...form.field("petDetails")} autoComplete="off" />
                </Field>
              ) : null}
            </Section>

            <Section title="Before you send it">
              <label
                htmlFor={`${form.prefix}consent`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  id={`${form.prefix}consent`}
                  type="checkbox"
                  checked={values.consent === "yes"}
                  onChange={(event) => form.set("consent", event.target.checked ? "yes" : "")}
                  aria-describedby={form.errors.consent ? `${form.prefix}consent-error` : undefined}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  I agree to my details being used to check my references, identity and right to
                  rent for this tenancy, and to them being kept securely for as long as the law
                  requires.
                </span>
              </label>
              {form.errors.consent?.[0] ? (
                <p id={`${form.prefix}consent-error`} className="-mt-2 text-xs text-destructive">
                  {form.errors.consent[0]}
                </p>
              ) : null}
            </Section>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Sending…" : "Send application"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={pending}
                onClick={() => save(false)}
              >
                Save for later
              </Button>
            </div>
          </form>
        </FormIdPrefix>
      </CardContent>
    </Card>
  );
}

function Uploads({
  token,
  folder,
  documents,
}: {
  token: string;
  folder: string;
  documents: PortalOverview["documents"];
}) {
  const router = useRouter();
  const typeId = useId();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = !type
      ? "Choose what kind of document this is."
      : file
        ? fileProblem(file)
        : "Choose a file to upload.";
    setError(problem);
    if (problem || !file) return;

    startTransition(async () => {
      const path = `${folder}${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await anonymousStorage().upload(path, file, {
        contentType: fileContentType(file)!,
        upsert: false,
      });
      if (uploadError) {
        setError("We couldn't upload that file. Please try again.");
        return;
      }
      const result = await recordUpload(token, { path, fileName: file.name, documentType: type });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      toast.success(result.message);
      setFile(null);
      setType("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Your documents</h2>
          <p className="text-sm text-muted-foreground">
            Upload a photo of your ID for the right to rent check, and anything else you&apos;ve
            been asked for. Only the letting team can see them.
          </p>
        </div>

        {documents.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm" aria-label="Uploaded documents">
            {documents.map((document, index) => (
              <li key={index} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {DOCUMENT_TYPE_LABELS[document.type as keyof typeof DOCUMENT_TYPE_LABELS] ??
                      "Document"}
                  </span>
                  <span className="block truncate text-muted-foreground">{document.fileName}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
          aria-label="Upload a document"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={typeId}>What is it?</Label>
            <select
              id={typeId}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setError(null);
              }}
              className={selectClass}
            >
              <option value="">Choose…</option>
              {Object.entries(UPLOAD_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fileId}>File</Label>
            <input
              ref={fileInput}
              id={fileId}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
              className="text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted-foreground">A PDF or a photo, up to 20 MB.</p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              <Upload aria-hidden />
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
