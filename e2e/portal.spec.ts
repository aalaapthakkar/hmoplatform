import { expect, test } from "@playwright/test";

test("the tenant portal requires a signed-in user", async ({ page }) => {
  for (const path of ["/portal", "/portal/rent", "/portal/repairs/new", "/portal/messages"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/log-in$/);
  }
});

test("a broken tenant invite link explains what to do", async ({ page }) => {
  const response = await page.goto("/portal/join/not-a-real-invite");
  await expect(page).toHaveURL(/\/portal\/join\/not-a-real-invite$/);
  await expect(
    page.getByRole("heading", { name: "This invite isn't valid any more" }),
  ).toBeVisible();
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["cache-control"]).toContain("no-store");
});

test("the portal can be installed on a phone", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json).toMatchObject({ start_url: "/portal", scope: "/portal", display: "standalone" });

  for (const icon of json.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/apple-icon")).ok()).toBe(true);

  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(worker.headers()["cache-control"]).toBe("no-cache");
  expect(await worker.text()).toContain("/offline.html");
  expect((await request.get("/offline.html")).ok()).toBe(true);
});
