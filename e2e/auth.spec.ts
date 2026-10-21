import { expect, test } from "@playwright/test";

test("the home page sends signed-out visitors to log in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/log-in$/);
});

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

test("the properties pages require a signed-in user", async ({ page }) => {
  await page.goto("/properties");
  await expect(page).toHaveURL(/\/log-in$/);
  await page.goto("/properties/new");
  await expect(page).toHaveURL(/\/log-in$/);
  await page.goto("/properties/0f8fad5b-d9cb-469f-a165-70867728950e/documents");
  await expect(page).toHaveURL(/\/log-in$/);
  await page.goto(
    "/properties/0f8fad5b-d9cb-469f-a165-70867728950e/rooms/0f8fad5b-d9cb-469f-a165-70867728950e",
  );
  await expect(page).toHaveURL(/\/log-in$/);
});

test("occupancy and its CSV require a signed-in user", async ({ page, request }) => {
  await page.goto("/occupancy");
  await expect(page).toHaveURL(/\/log-in$/);
  const csv = await request.get("/occupancy/export", { maxRedirects: 0 });
  expect(csv.status()).toBe(307);
  expect(csv.headers().location).toMatch(/\/log-in$/);
});

test("onboarding requires a signed-in user", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/log-in$/);
});

test("an expired email link shows a friendly message", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/log-in\?error=link$/);
  await expect(page.getByText("That link has expired or has already been used.")).toBeVisible();
});
