import { expect, type Page } from "@playwright/test";

/** Answers postcode lookups locally, so the tests never depend on postcodes.io. */
export async function fakePostcodeLookup(page: Page) {
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

/** A unique address per run: nothing can be deleted, so every run adds new properties. */
export function uniqueAddress(street: string) {
  return `${Date.now()}${Math.floor(Math.random() * 1000)} ${street}`;
}

/** Adds an owned house share through the wizard and waits for it on the Properties page. */
export async function addHouseShare(page: Page, address: string, rooms: number) {
  await fakePostcodeLookup(page);
  await page.goto("/properties/new");
  await page.getByLabel("Postcode").fill("ls62ab");
  await page.getByLabel("Address line 1").click();
  await expect(page.getByLabel("Town or city")).toHaveValue("Leeds");
  await page.getByLabel("Address line 1").fill(address);
  await page.keyboard.press("Enter");
  await page.getByLabel("Number of rooms").fill(String(rooms));
  await page.keyboard.press("Enter");
  await page.getByLabel("Owned").check();
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page).toHaveURL(/\/properties$/);
}
