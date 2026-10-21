import { type Browser, expect, type Page, test } from "@playwright/test";
import { addHouseShare, addTenancy, londonDate, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** A 1×1 PNG, standing in for a photo of a leak. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** A signed-out phone browser, for the tenant. */
async function tenantPhone(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    baseURL,
    // Not the staff login the config gives every new context.
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  return context.newPage();
}

/** Lets a room to a new tenant from today, invites them and returns the invite link. */
async function letAndInvite(page: Page, first: string, last: string) {
  const address = uniqueAddress("Portal Street");
  await addHouseShare(page, address, 1);
  await page.goto((await page.getByRole("link", { name: address }).getAttribute("href"))!);
  await page.getByRole("link", { name: "Tenancies for Room 1" }).click();
  const today = londonDate();
  await addTenancy(page, first, last, today, Number(today.slice(8)));
  await expect(page.getByText(new RegExp(`^Tenancy for ${first} ${last} added`))).toBeVisible();
  const invite = page.getByTestId("portal-invite");
  await invite.getByRole("button", { name: "Invite to portal" }).click();
  const link = await invite.getByLabel("Portal invite link").inputValue();
  return { address, link, roomUrl: page.url() };
}

test("a tenant joins the portal on their phone and uses it", async ({ page, browser, baseURL }) => {
  test.skip(test.info().project.name !== "chromium", "The tenant side always runs at phone size.");
  test.setTimeout(180_000);

  const { address, link, roomUrl } = await letAndInvite(page, "Tara", "Tenant");
  const tenant = await tenantPhone(browser, baseURL);
  const email = `tara.${Date.now()}@hmo-platform-e2e.test`;

  // Joining: the invite knows who it's for; they set a password.
  await tenant.goto(link);
  await expect(tenant.getByRole("heading", { name: "Welcome, Tara" })).toBeVisible();
  await tenant.getByLabel("Email").fill(email);
  await tenant.getByLabel("Choose a password").fill("a-long-tenant-password");
  await tenant.getByRole("button", { name: "Join the portal" }).click();
  await expect(tenant).toHaveURL(/\/portal$/);

  // Home: their room and house, and what they owe.
  await expect(tenant.getByRole("heading", { level: 1, name: "Room 1" })).toBeVisible();
  await expect(tenant.getByText(address)).toBeVisible();
  await expect(tenant.getByTestId("home-balance")).toHaveText("£550.00 owed");
  const tabs = tenant.getByRole("navigation", { name: "Tenant portal" });

  // Rent statement.
  await tabs.getByRole("link", { name: "Rent" }).click();
  await expect(tenant.getByTestId("statement-balance")).toHaveText("£550.00 owed");
  await expect(tenant.getByTestId("statement-line")).toHaveCount(1);

  // A repair with a photo.
  await tabs.getByRole("link", { name: "Repairs" }).click();
  await expect(tenant.getByText("No repairs reported.")).toBeVisible();
  await tenant.getByRole("link", { name: "Report a repair" }).click();
  await tenant.getByLabel("What needs fixing?").fill("Shower is leaking");
  await tenant.getByLabel("Where is it? (optional)").fill("First floor bathroom");
  await tenant.getByLabel("Tell us more").fill("Dripping through the ceiling since Monday.");
  await tenant.getByLabel(/^Urgent/).check();
  await tenant.locator('input[type="file"]').setInputFiles({
    name: "leak.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });
  await expect(tenant.getByRole("list", { name: "Photos to send" })).toContainText("leak.png");
  await tenant.getByRole("button", { name: "Send repair report" }).click();
  await expect(tenant.getByText("Repair reported. We'll be in touch.")).toBeVisible();
  await expect(tenant).toHaveURL(/\/portal\/repairs$/);
  const repair = tenant.getByTestId("repair");
  await expect(repair).toContainText("Shower is leaking");
  await expect(repair.getByTestId("repair-status")).toHaveText("Reported");
  const photo = repair.getByRole("img", { name: "Photo: leak.png" });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);

  // Messages.
  await tabs.getByRole("link", { name: "Messages" }).click();
  await tenant.getByLabel("Your message").fill("Hello, when is the bin day?");
  await tenant.getByRole("button", { name: "Send", exact: true }).click();
  await expect(tenant.getByTestId("message")).toContainText("Hello, when is the bin day?");
  await expect(tenant.getByTestId("message")).toContainText("You ·");

  // More: documents and the welcome pack (none yet).
  await tabs.getByRole("link", { name: "More" }).click();
  await tenant.getByRole("link", { name: "Documents" }).click();
  await expect(tenant.getByText("No documents yet.")).toBeVisible();
  await tabs.getByRole("link", { name: "More" }).click();
  await tenant.getByRole("link", { name: "Welcome pack" }).click();
  await expect(tenant.getByTestId("welcome-pack")).toContainText("hasn't added a welcome pack");

  // Tenants never reach the staff app.
  const tenancyId = new URL(roomUrl).searchParams.get("tenancy");
  for (const path of ["/dashboard", "/properties", `/tenancies/${tenancyId}/statement`]) {
    await tenant.goto(path);
    await expect(tenant).toHaveURL(/\/portal$/);
  }
  const download = await tenant.request.get(
    "/portal/documents/00000000-0000-4000-8000-000000000000/download",
    { maxRedirects: 0 },
  );
  expect(download.status()).toBe(404);

  // The invite worked once.
  await tenant.goto(link);
  await expect(
    tenant.getByRole("heading", { name: "This invite isn't valid any more" }),
  ).toBeVisible();

  // Staff see that they've joined.
  await page.goto(roomUrl);
  await expect(page.getByTestId("portal-invite")).toContainText("Joined");
  await tenant.context().close();
});
