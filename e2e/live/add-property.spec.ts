import { expect, type Page, test } from "@playwright/test";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** Answers postcode lookups locally, so the test never depends on postcodes.io. */
async function fakePostcodeLookup(page: Page) {
  await page.route("https://api.postcodes.io/postcodes/**", (route) =>
    route.fulfill({
      json: {
        status: 200,
        result: {
          postcode: "LS6 2AB",
          admin_district: "Leeds",
          region: "Yorkshire and The Humber",
        },
      },
    }),
  );
}

test("an operator can add a 6 room HMO in under a minute", async ({ page }) => {
  await fakePostcodeLookup(page);
  // Unique per run: nothing can be deleted, so every run adds a new property.
  const address = `${Date.now()} Wizard Street`;
  const started = Date.now();

  await page.goto("/properties");
  await page.getByRole("link", { name: "Add property" }).first().click();
  await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();

  // Step 1: postcode first, which fills in the town and council.
  await page.getByLabel("Postcode").fill("ls62ab");
  await page.getByLabel("Address line 1").click();
  await expect(page.getByLabel("Town or city")).toHaveValue("Leeds");
  await expect(page.getByLabel("Council (optional)")).toHaveValue("Leeds");
  await expect(page.getByLabel("Postcode")).toHaveValue("LS6 2AB");
  await page.getByLabel("Address line 1").fill(address);
  await page.keyboard.press("Enter");

  // Step 2: house share is already chosen; just the number of rooms.
  await expect(page.getByRole("heading", { name: "How is it let?" })).toBeVisible();
  await expect(page.getByLabel("House share")).toBeChecked();
  await page.getByLabel("Number of rooms").fill("6");
  await page.keyboard.press("Enter");

  // Step 3: owned, then save.
  await expect(page.getByRole("heading", { name: "How do you hold it?" })).toBeVisible();
  await page.getByLabel("Owned").check();
  await page.getByRole("button", { name: "Add property" }).click();

  await expect(page).toHaveURL(/\/properties$/);
  await expect(page.getByText(`${address} added with 6 rooms.`)).toBeVisible();
  const card = page.getByTestId("property-card").filter({ hasText: address });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Leeds LS6 2AB");
  await expect(card).toContainText("0 of 6 rooms let");

  expect(Date.now() - started).toBeLessThan(60_000);
});

test("the wizard explains what's missing before moving on", async ({ page }) => {
  await fakePostcodeLookup(page);
  await page.goto("/properties/new");

  await page.getByLabel("Postcode").fill("LS6");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter a full UK postcode, like M14 6PZ")).toBeVisible();
  await expect(page.getByText("Enter the first line of the address")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();

  await page.getByLabel("Postcode").fill("LS6 2AB");
  await page.getByLabel("Address line 1").fill("1 Test Street");
  await expect(page.getByLabel("Town or city")).toHaveValue("Leeds");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter the number of rooms")).toBeVisible();

  await page.getByLabel("Number of rooms").fill("6");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByText("Choose how you hold this property")).toBeVisible();

  await page.getByLabel("Master lease").check();
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByText("Enter the head rent")).toBeVisible();
  await expect(page).toHaveURL(/\/properties\/new$/);
});
