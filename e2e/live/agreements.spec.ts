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

/** Signs the next person in line on the pretend provider's test page, then comes back. */
async function signNext(page: Page, request: ReturnType<Page["getByTestId"]>) {
  const back = page.url();
  await request.getByRole("link", { name: "Test signing page" }).click();
  await page.getByRole("button", { name: /^Sign as / }).click();
  await expect(page.getByText("Signed.", { exact: true })).toBeVisible();
  await page.goto(back);
}

test("tenancy and guarantor agreements: generate, send, sign, and remove the guarantor midway", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const address = uniqueAddress("Signing Street");
  const lastName = `Signer${Math.floor(Math.random() * 1e6)}`;

  // An upcoming tenancy with onboarding, so the agreement step can be ticked.
  await addHouseShare(page, address, 1);
  const propertyHref = await page.getByRole("link", { name: address }).getAttribute("href");
  await page.goto(propertyHref!);
  await page.getByRole("link", { name: "Tenancies for Room 1" }).click();
  await page.getByRole("button", { name: "Add tenancy" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("First name").fill("Tara");
  await form.getByLabel("Last name").fill(lastName);
  await form.getByLabel("Email (optional)").fill("tara@example.com");
  await form.getByLabel("Start date").fill(londonDate(14));
  await form.getByLabel("Rent per month").fill("600");
  await form.getByRole("button", { name: "Add tenancy" }).click();
  await expect(page.getByText(/added and onboarding started/)).toBeVisible();
  const roomUrl = page.url();

  // A guarantor.
  const agreement = page.getByTestId("agreement-section");
  await agreement.getByRole("button", { name: "Add guarantor" }).click();
  await agreement.getByLabel("Guarantor's name").fill("Gail Guarantor");
  await agreement.getByLabel("Guarantor's email").fill("gail@example.com");
  await agreement.getByRole("button", { name: "Add guarantor" }).click();
  await expect(page.getByText("Gail Guarantor added as guarantor.")).toBeVisible();

  // The PDFs, made from the DRAFT templates.
  for (const name of ["Preview tenancy agreement", "Preview guarantor agreement"]) {
    const href = await agreement.getByRole("link", { name }).getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
  }

  // Both go out as separate requests.
  await agreement.getByRole("button", { name: "Send for signature" }).click();
  await expect(
    page.getByText("Sent for signature: tenancy agreement and guarantor agreement."),
  ).toBeVisible();
  const requests = page.getByTestId("signature-request");
  const tenancyRequest = requests.filter({ hasText: "Tenancy agreement" });
  const guarantorRequest = requests.filter({ hasText: "Guarantor agreement" });
  await expect(requests).toHaveCount(2);

  // The tenant signs.
  await signNext(page, tenancyRequest);
  await expect(tenancyRequest).toContainText("Partly signed");
  await expect(tenancyRequest).toContainText(/Tenant: Tara .*Signed/);

  // The guarantor isn't needed after all: only their agreement is cancelled.
  await agreement.getByRole("button", { name: "Remove guarantor requirement" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Remove requirement" }).click();
  await expect(dialog.getByText("Give a reason")).toBeVisible();
  await dialog.getByLabel("Reason").fill("Tenant paid six months upfront");
  await dialog.getByRole("button", { name: "Remove requirement" }).click();
  await expect(
    page.getByText(/Guarantor requirement removed\. The tenancy agreement/),
  ).toBeVisible();
  await expect(guarantorRequest).toContainText("Cancelled");
  await expect(guarantorRequest).toContainText(
    "Guarantor requirement removed: Tenant paid six months upfront",
  );
  await expect(tenancyRequest).toContainText("Partly signed");
  await expect(tenancyRequest).toContainText(/Tenant: Tara .*Signed/);
  await expect(agreement.getByTestId("guarantor")).toContainText(
    "Gail Guarantor was removed as guarantor",
  );

  // The countersignature completes it, and the signed copy is saved.
  await signNext(page, tenancyRequest);
  await expect(tenancyRequest).toContainText("Signed", { timeout: 15_000 });
  const signedCopy = tenancyRequest.getByRole("link", { name: "Signed copy" });
  await expect(signedCopy).toBeVisible({ timeout: 15_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), signedCopy.click()]);
  expect(
    readFileSync((await download.path())!)
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");

  // The onboarding's agreement step is ticked.
  await page.goto(roomUrl);
  await page.getByRole("link", { name: "View onboarding" }).click();
  await expect(
    page.getByTestId("onboarding-step").filter({ hasText: "Tenancy agreement signed" }),
  ).toContainText("Done");

  // The removal is in the property's activity, with the reason.
  await page.goto(`${propertyHref}/activity`);
  const removal = page
    .getByTestId("activity-entry")
    .filter({ hasText: "Gail Guarantor" })
    .filter({ hasText: "Guarantor requirement removed" });
  await expect(removal).toContainText("Reason: none → Tenant paid six months upfront");
  await expect(
    page
      .getByTestId("activity-entry")
      .filter({ hasText: "Guarantor agreement" })
      .filter({ hasText: "Cancelled" }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("activity-entry").filter({ hasText: "Signed by everyone" }),
  ).toHaveCount(1);
});
