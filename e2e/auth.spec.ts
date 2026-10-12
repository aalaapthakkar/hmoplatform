import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to the log-in page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/log-in$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("log-in form explains what is missing", async ({ page }) => {
  await page.goto("/log-in");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Enter your email address")).toBeVisible();
  await expect(page.getByText("Enter your password")).toBeVisible();
});

test("auth pages link to each other", async ({ page }) => {
  await page.goto("/log-in");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByRole("link", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Forgotten your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("an expired email link shows a friendly message", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/log-in\?error=link$/);
  await expect(page.getByText("That link has expired or has already been used.")).toBeVisible();
});
