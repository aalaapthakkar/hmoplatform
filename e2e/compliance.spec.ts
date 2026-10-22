import { expect, test } from "@playwright/test";

test("compliance pages and exports need a signed-in user", async ({ page }) => {
  for (const path of [
    "/compliance",
    "/compliance/export",
    "/settings/compliance",
    "/settings/notifications",
    "/properties/0f8fad5b-d9cb-469f-a165-70867728950e/compliance",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/log-in$/);
  }
});

test("the reminder job refuses callers without the secret", async ({ request }) => {
  const missing = await request.get("/api/cron/compliance-reminders");
  expect(missing.status()).toBe(401);
  const wrong = await request.get("/api/cron/compliance-reminders", {
    headers: { Authorization: `Bearer ${"x".repeat(40)}` },
  });
  expect(wrong.status()).toBe(401);
});
