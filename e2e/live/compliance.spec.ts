import { expect, type Page, test } from "@playwright/test";
import { addHouseShare, londonDate, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** A minimal PDF, so uploads don't depend on a file on disk. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

const item = (page: Page, key: string) =>
  page.locator(`[data-testid="compliance-item"][data-type="${key}"]`);

/** Opens Record for an item and returns the sheet. */
async function openRecord(page: Page, key: string) {
  await item(page, key)
    .getByRole("button", { name: /^Record/ })
    .click();
  return page.getByRole("dialog");
}

async function save(page: Page, name: string) {
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${name} recorded.`)).toBeVisible();
}

test("a property's compliance: record checks, certificates, details and what isn't needed", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const address = uniqueAddress("Compliance Crescent");
  await addHouseShare(page, address, 2);
  const propertyUrl = (await page.getByRole("link", { name: address }).getAttribute("href"))!;
  await page.goto(`${propertyUrl}/compliance`);
  await expect(page.getByRole("heading", { name: "Compliance", level: 2 })).toBeVisible();

  // A new property starts with everything missing.
  await expect(item(page, "gas_safety").getByTestId("compliance-status")).toHaveText("Missing");
  await expect(item(page, "hmo_licence").getByTestId("compliance-status")).toHaveText("Missing");

  // Gas safety: done 10 days ago, so it lasts until a year after that.
  const doneOn = londonDate(-10);
  let sheet = await openRecord(page, "gas_safety");
  await sheet.getByLabel("Done on").fill(doneOn);
  const expected = `${Number(doneOn.slice(0, 4)) + 1}${doneOn.slice(4)}`;
  await expect(sheet.getByLabel("Expiry date")).toHaveValue(expected);
  await sheet
    .getByLabel("Certificate", { exact: true })
    .setInputFiles({ name: "gas-safety.pdf", mimeType: "application/pdf", buffer: PDF });
  await save(page, "Gas safety certificate");
  await expect(item(page, "gas_safety").getByTestId("compliance-status")).toHaveText("OK");
  await expect(item(page, "gas_safety")).toContainText("gas-safety.pdf");

  // EICR expiring in 20 days: inside its 90-day window.
  sheet = await openRecord(page, "eicr");
  await sheet.getByLabel("Expiry date").fill(londonDate(20));
  await sheet
    .getByLabel("Certificate", { exact: true })
    .setInputFiles({ name: "eicr.pdf", mimeType: "application/pdf", buffer: PDF });
  await save(page, "Electrical installation condition report (EICR)");
  await expect(item(page, "eicr").getByTestId("compliance-status")).toHaveText("Due soon");
  await expect(item(page, "eicr")).toContainText("In 20 days");

  // A required certificate that isn't uploaded keeps it missing.
  sheet = await openRecord(page, "pat");
  await sheet.getByLabel("Done on").fill(londonDate(-1));
  await save(page, "Portable appliance testing (PAT)");
  await expect(item(page, "pat").getByTestId("compliance-status")).toHaveText("Missing");
  await expect(item(page, "pat")).toContainText("Certificate not uploaded yet");

  // The HMO licence's extra details.
  sheet = await openRecord(page, "hmo_licence");
  await sheet.getByLabel("Expiry date").fill(londonDate(1000));
  await sheet.getByLabel("Licence number (optional)").fill("HMO/2026/0042");
  await sheet.getByLabel("Scheme (optional)").selectOption("Mandatory");
  await sheet.getByLabel("Maximum occupants (optional)").fill("six");
  await sheet
    .getByLabel("Certificate", { exact: true })
    .setInputFiles({ name: "licence.pdf", mimeType: "application/pdf", buffer: PDF });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Enter a number")).toBeVisible();
  await sheet.getByLabel("Maximum occupants (optional)").fill("6");
  await save(page, "HMO licence");
  const licence = item(page, "hmo_licence");
  await expect(licence.getByTestId("compliance-status")).toHaveText("OK");
  await expect(licence).toContainText("HMO/2026/0042");
  await expect(licence).toContainText("Mandatory");

  // Not needed here, then needed again.
  await item(page, "boiler_service")
    .getByRole("button", { name: /not needed here/ })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Why not?").fill("Electric heating only");
  await dialog.getByRole("button", { name: "Mark not needed" }).click();
  await expect(item(page, "boiler_service").getByTestId("compliance-status")).toHaveText(
    "Not needed",
  );
  await expect(item(page, "boiler_service")).toContainText("Electric heating only");
  await item(page, "boiler_service").getByRole("button", { name: "Needed again" }).click();
  await expect(item(page, "boiler_service").getByTestId("compliance-status")).toHaveText("Missing");

  // The org-wide dashboard, narrowed to this property.
  const propertyId = propertyUrl.split("/").at(-1)!;
  await page.goto(`/compliance?property=${propertyId}`);
  await expect(page.getByTestId("total-amber")).toHaveText("1");
  await expect(page.getByTestId("total-green")).toHaveText("2");
  if (test.info().project.name === "chromium") {
    const row = page.getByTestId("compliance-row");
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-status="due_soon"]')).toHaveCount(1);
  }
  await page
    .getByRole("navigation", { name: "Status" })
    .getByRole("link", { name: "Due soon" })
    .click();
  await expect(page).toHaveURL(/rag=amber/);
  const csv = await page.request.get(`/compliance/export?property=${propertyId}`);
  expect(csv.ok()).toBe(true);
  const text = await csv.text();
  expect(text).toContain('"HMO licence"');
  expect(text).toContain("Licence number: HMO/2026/0042");
  await page.goto(propertyUrl);

  // It's all in the property's history.
  await page
    .getByRole("navigation", { name: "Property sections" })
    .getByRole("link", { name: "Activity" })
    .click();
  const entries = page.getByTestId("activity-entry");
  await expect(entries.filter({ hasText: "Marked not needed here" })).toHaveCount(1);
  await expect(entries.filter({ hasText: "Needed again" })).toHaveCount(1);
  await expect(entries.filter({ hasText: "Uploaded gas-safety.pdf" })).toHaveCount(1);
});

test("admins add their own compliance types, with extra details", async ({ page }) => {
  test.setTimeout(120_000);
  const name = `Lift service ${Date.now()}`;
  await page.goto("/settings/compliance");
  await page.getByRole("link", { name: "Add a type" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Lasts for (months)").fill("6");
  await page.getByLabel("Alert window (days)").fill("14");
  await page.getByRole("button", { name: "Add a detail" }).click();
  await page.getByLabel("Detail 1 label").fill("Engineer");
  await page.getByRole("button", { name: "Add type" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // It applies to every property straight away.
  const address = uniqueAddress("Lift Lane");
  await addHouseShare(page, address, 1);
  const propertyUrl = (await page.getByRole("link", { name: address }).getAttribute("href"))!;
  await page.goto(`${propertyUrl}/compliance`);
  const lift = page.getByTestId("compliance-item").filter({ hasText: name });
  await expect(lift.getByTestId("compliance-status")).toHaveText("Missing");
  await lift.getByRole("button", { name: /^Record/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Done on").fill(londonDate(-1));
  await sheet.getByLabel("Engineer (optional)").fill("Lift Co");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(lift.getByTestId("compliance-status")).toHaveText("Missing"); // certificate required
  await expect(lift).toContainText("Lift Co");

  // Archived, it disappears from properties.
  await page.goto("/settings/compliance");
  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(`${name} archived.`)).toBeVisible();
  await page.goto(`${propertyUrl}/compliance`);
  await expect(page.getByTestId("compliance-item").filter({ hasText: name })).toHaveCount(0);
});
