import { type Browser, expect, type Page, test } from "@playwright/test";
import { addHouseShare, addTenancy, londonDate, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** A minimal PDF, so the upload doesn't depend on a file on disk. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
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

  // Staff find the repair on the property's Maintenance page and start work.
  const propertyUrl = roomUrl.split("/rooms/")[0]!;
  await page.goto(`${propertyUrl}/maintenance`);
  const staffRepair = page.getByTestId("repair").filter({ hasText: "Shower is leaking" });
  await expect(staffRepair).toContainText("Room 1 · First floor bathroom");
  await expect(staffRepair.getByRole("img", { name: "Photo: leak.png" })).toBeVisible();
  await staffRepair.getByLabel("Status").selectOption("in_progress");
  await expect(page.getByText("Marked as in progress.")).toBeVisible();

  // They reply from Messages.
  await page.goto("/messages");
  const thread = page
    .getByRole("list", { name: "Conversations" })
    .getByRole("link")
    .filter({ hasText: address });
  await expect(thread).toContainText("Needs a reply");
  await thread.click();
  await expect(page.getByTestId("message").first()).toContainText("Tara Tenant ·");
  await page.getByLabel("Your reply").fill("Bins go out on Tuesday nights.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("message").last()).toContainText("You ·");

  // They write a welcome pack.
  await page.goto(`${propertyUrl}/details`);
  await page
    .getByLabel("Welcome pack for tenants")
    .fill(
      "# Welcome to the house\n\n- Bins go out on Tuesday nights\n- The Wi-Fi details are on the router",
    );
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();

  // They give the tenant a document.
  await page.goto(`${propertyUrl}/documents`);
  await page.getByLabel("Type").selectOption("other");
  await page
    .getByLabel("File")
    .setInputFiles({ name: "house-guide.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("house-guide.pdf uploaded.")).toBeVisible({ timeout: 15_000 });
  const row = page.getByTestId("document-row").filter({ hasText: "house-guide.pdf" });
  await row.getByRole("button", { name: "Give house-guide.pdf to a tenant" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByLabel("Tenancy")).toHaveValue(tenancyId!);
  await dialog.getByRole("button", { name: "Give to tenant" }).click();
  await expect(page.getByText("Document given. It's in their portal now.")).toBeVisible();
  await expect(row.getByTestId("served-to")).toContainText("Tara Tenant (Room 1)");

  // The tenant sees all of it.
  await tenant.goto("/portal/repairs");
  await expect(tenant.getByTestId("repair-status")).toHaveText("In progress");
  await tenant.goto("/portal/messages");
  await expect(tenant.getByTestId("message").last()).toContainText(
    "Bins go out on Tuesday nights.",
  );
  await tenant.goto("/portal/welcome");
  const pack = tenant.getByTestId("welcome-pack");
  await expect(pack.getByRole("heading", { name: "Welcome to the house" })).toBeVisible();
  await expect(pack.getByRole("listitem")).toHaveCount(2);
  await tenant.goto("/portal/documents");
  const href = await tenant
    .getByRole("link", { name: "Download house-guide.pdf" })
    .getAttribute("href");
  const file = await tenant.request.get(href!);
  expect(file.ok()).toBe(true);
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await tenant.context().close();
});
