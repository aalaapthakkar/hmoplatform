import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/user.json";
export const E2E_ORG_NAME = "E2E test organisation";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

/**
 * Signs in as the test user, creating the account and its organisation the
 * first time, and saves the session for the tests to reuse.
 */
setup("sign in as the test user", async ({ page }) => {
  if (!email || !password) {
    // Write an empty session so the other tests can start, then skip.
    mkdirSync("e2e/.auth", { recursive: true });
    writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.");
    return;
  }

  await page.goto("/log-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  const signedIn = page.waitForURL(/\/(dashboard|onboarding)$/, { timeout: 15_000 });
  const refused = page.getByRole("alert").waitFor({ timeout: 15_000 });
  const outcome = await Promise.race([signedIn.then(() => "in"), refused.then(() => "refused")]);

  if (outcome === "refused") {
    // First run: the test account doesn't exist yet.
    await page.goto("/sign-up");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/onboarding$/, { timeout: 15_000 }).catch(() => {
      throw new Error(
        'Sign-up didn\'t sign the test user in. Turn off "Confirm email" in Supabase (Authentication > Sign In / Providers > Email), then rerun.',
      );
    });
  }

  if (page.url().endsWith("/onboarding")) {
    await page.getByLabel("Organisation name").fill(E2E_ORG_NAME);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/dashboard$/);
  }

  await expect(page.getByText(E2E_ORG_NAME).first()).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
