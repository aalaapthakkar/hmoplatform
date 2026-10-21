import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { addHouseShare, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

function londonDate(daysFromToday = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** The applicant fills in and sends their application in the portal. */
async function sendApplication(portal: Page, legalName: string) {
  await portal.getByLabel("Full legal name").fill(legalName);
  await portal.getByLabel("Date of birth").fill("1998-03-14");
  await portal.getByLabel("Email").fill("applicant@example.com");
  await portal.getByLabel("Mobile number").fill("07700 900777");
  await portal.getByLabel("Address", { exact: true }).fill("9 Elm Road, Leeds");
  await portal.getByLabel("Postcode").fill("ls6 2bb");
  await portal.getByLabel("How long you've lived there").selectOption("1_to_3");
  await portal.getByLabel("What do you do?").selectOption("employed");
  await portal.getByLabel("Employer or business").fill("Acme Ltd");
  await portal.getByLabel("Yearly income before tax").fill("27500");
  await portal.getByRole("group", { name: "Do you have a guarantor?" }).getByLabel("No").check();
  await portal.getByLabel("Name", { exact: true }).fill("Sam Applicant");
  await portal.getByLabel("Phone number").fill("07700 900888");
  await portal.getByRole("group", { name: "Do you smoke?" }).getByLabel("No").check();
  await portal.getByRole("group", { name: "Do you have pets?" }).getByLabel("No").check();
  await portal.getByLabel(/I agree to my details/).check();
  await portal.getByRole("button", { name: "Send application" }).click();
  await expect(portal.getByTestId("application-sent")).toBeVisible();
}

test("tenant onboarding, from upcoming tenancy to move-in, with the applicant portal", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const address = uniqueAddress("Onboarding Way");
  const lastName = `Applicant${Math.floor(Math.random() * 1e6)}`;
  const applicant = `Rhea ${lastName}`;

  // An upcoming tenancy for tomorrow, with onboarding started straight away.
  await addHouseShare(page, address, 2);
  const propertyHref = await page.getByRole("link", { name: address }).getAttribute("href");
  await page.goto(propertyHref!);
  await page.getByRole("link", { name: "Tenancies for Room 1" }).click();
  await page.getByRole("button", { name: "Add tenancy" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("First name").fill("Rhea");
  await form.getByLabel("Last name").fill(lastName);
  await form.getByLabel("Email (optional)").fill("rhea@example.com");
  await form.getByLabel("Start date").fill(londonDate(1));
  await form.getByLabel("Rent per month").fill("550");
  await expect(form.getByLabel("Start onboarding")).toBeChecked();
  await form.getByRole("button", { name: "Add tenancy" }).click();
  await expect(
    page.getByText(`Tenancy for ${applicant} added and onboarding started.`),
  ).toBeVisible();

  // The onboarding has the eight default steps, starting with the application.
  await page.getByRole("link", { name: "View onboarding" }).click();
  await expect(page.getByRole("heading", { level: 1, name: applicant })).toBeVisible();
  await expect(page.getByTestId("onboarding-step")).toHaveCount(8);
  const onboardingUrl = page.url();

  // The Onboarding list shows them waiting on the applicant.
  await page.goto("/applicants?show=applicant");
  const listed = page.getByText(applicant).locator("visible=true");
  await expect(listed).toHaveCount(1);
  await page.goto(onboardingUrl);

  // A secure link for the applicant.
  await page.getByRole("button", { name: "Create link" }).click();
  const link = await page.getByLabel("Applicant link").inputValue();
  expect(link).toMatch(/\/apply\/[A-Za-z0-9_-]{43}$/);

  // The applicant, signed out in their own browser: application, ID upload, progress.
  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const portal = await applicantContext.newPage();
  await portal.goto(link);
  await expect(portal.getByRole("heading", { name: "Hi Rhea, welcome" })).toBeVisible();
  await expect(portal.getByTestId("portal-step").first()).toContainText("Your turn");
  await sendApplication(portal, applicant);
  await portal.getByLabel("What is it?").selectOption("identity");
  await portal
    .getByLabel("File")
    .setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: PDF });
  await portal.getByRole("button", { name: "Upload" }).click();
  await expect(portal.getByText("passport.pdf uploaded.")).toBeVisible({ timeout: 15_000 });
  await expect(portal.getByTestId("portal-step").first()).toContainText("Done");
  await expect(portal.getByTestId("portal-step").nth(1)).toContainText("In progress");

  // Back as staff: the answers, the upload (which downloads) and the application step done.
  await page.reload();
  await expect(page.getByTestId("application-card")).toContainText(applicant);
  await expect(page.getByTestId("application-card")).toContainText("£27,500.00");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download passport.pdf" }).click(),
  ]);
  expect(
    readFileSync((await download.path())!)
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");
  const steps = page.getByTestId("onboarding-step");
  await expect(steps.nth(0)).toContainText("Done");

  // Right to rent: time-limited permission, which creates a follow-up reminder.
  await page.getByRole("button", { name: "Record a check" }).click();
  const rightToRent = page.getByTestId("right-to-rent-card");
  await rightToRent.getByLabel("Home Office online check (share code)").check();
  await rightToRent.getByLabel("Time-limited permission").check();
  await rightToRent.getByLabel("Permission ends on").fill(londonDate(60));
  await rightToRent.getByRole("button", { name: "Record check" }).click();
  await expect(page.getByText(/Right to rent check recorded, with a reminder/)).toBeVisible();
  await expect(steps.nth(1)).toContainText("Done");
  await expect(rightToRent).toContainText(`Right to rent follow-up check for ${applicant}`);

  // The staff steps.
  for (const title of [
    "Referencing",
    "Holding deposit",
    "Tenancy agreement signed",
    "Deposit received",
    "First rent received",
  ]) {
    await page.getByRole("button", { name: `Mark ${title} done` }).click();
    await expect(steps.filter({ hasText: title })).toContainText("Done");
  }

  // Moving in waits for the move-in date; it moves to today.
  await page.getByRole("button", { name: "Mark Move in done" }).click();
  await expect(page.getByText(/This tenancy starts on/)).toBeVisible();
  await page.getByRole("link", { name: /Room 1,/ }).click();
  await page.getByRole("button", { name: "Change move-in date" }).click();
  await page.getByRole("dialog").getByLabel("New move-in date").fill(londonDate(0));
  await page.getByRole("dialog").getByRole("button", { name: "Change date" }).click();
  await expect(page.getByText("Move-in date changed.")).toBeVisible();
  await page.goto(onboardingUrl);
  await page.getByRole("button", { name: "Mark Move in done" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByTestId("onboarding-summary")).toContainText("8 of 8 steps done");

  // The tenancy is current and the room is let.
  await page.goto(propertyHref!);
  const card = page.getByTestId("room-card").filter({ hasText: "Room 1" });
  await expect(card).toContainText(applicant);
  await expect(card).toContainText("Let");

  // It has left the in-progress list, and the reminder is on the dashboard.
  await page.goto("/applicants");
  await expect(page.getByText(applicant).locator("visible=true")).toHaveCount(0);
  await page.goto("/applicants?show=closed");
  await expect(page.getByText(applicant).locator("visible=true")).toHaveCount(1);
  await page.goto("/dashboard");
  await expect(page.getByTestId("coming-up")).toContainText(
    `Right to rent follow-up check for ${applicant}`,
  );

  // The applicant's link stopped working once they moved in.
  await portal.reload();
  await expect(portal.getByTestId("link-invalid")).toBeVisible();
  await applicantContext.close();
});

test("a made-up applicant link shows the friendly page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/apply/${"x".repeat(43)}`);
  await expect(page.getByTestId("link-invalid")).toBeVisible();
  await context.close();
});
