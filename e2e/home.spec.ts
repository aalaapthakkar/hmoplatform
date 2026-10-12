import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to the log-in page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/log-in$/);
});
