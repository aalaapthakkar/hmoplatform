import { expect, test } from "@playwright/test";
import { addHouseShare, addTenancy, londonDate, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

test("staff keep a rent statement and invite the tenant to the portal", async ({ page }) => {
  test.setTimeout(120_000);
  const address = uniqueAddress("Ledger Road");
  await addHouseShare(page, address, 1);
  await page.goto((await page.getByRole("link", { name: address }).getAttribute("href"))!);
  await page.getByRole("link", { name: "Tenancies for Room 1" }).click();

  // Rent is due today, so the first full month is charged straight away.
  const today = londonDate();
  await addTenancy(page, "Rina", "Ledger", today, Number(today.slice(8)));
  await expect(page.getByText(/^Tenancy for Rina Ledger added/)).toBeVisible();
  const panel = page.getByTestId("tenancy-panel");
  await expect(panel.getByTestId("rent-balance")).toHaveText("£550.00 owed");

  // The portal invite is shown once, with Copy link and Email it.
  const invite = panel.getByTestId("portal-invite");
  await expect(invite).toContainText("Not invited");
  await invite.getByRole("button", { name: "Invite to portal" }).click();
  await expect(invite.getByLabel("Portal invite link")).toHaveValue(
    /\/portal\/join\/[A-Za-z0-9_-]{43}$/,
  );
  await expect(invite.getByRole("link", { name: "Email it" })).toHaveAttribute(
    "href",
    /^mailto:.*subject=Your%20tenant%20portal/,
  );
  await expect(invite).toContainText(/Invited until \d{2}\/\d{2}\/\d{4}/);

  await panel.getByRole("link", { name: "Rent statement" }).click();
  await expect(page.getByRole("heading", { name: "Rent statement: Rina Ledger" })).toBeVisible();
  const balance = page.getByTestId("statement-balance");
  await expect(balance).toHaveText("£550.00 owed");
  await expect(page.getByTestId("statement-line")).toHaveCount(1);

  // A payment brings the balance down.
  const payment = page.getByRole("form", { name: "Record a payment" });
  await payment.getByLabel("Amount").fill("500");
  await payment.getByLabel("Reference (optional)").fill("RINA RENT");
  await payment.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment of £500.00 recorded.")).toBeVisible();
  await expect(balance).toHaveText("£50.00 owed");
  await expect(page.getByText("Bank transfer · RINA RENT")).toBeVisible();

  // A one-off charge adds to it.
  const charge = page.getByRole("form", { name: "Add a charge" });
  await charge.getByLabel("What it's for").fill("Replacement key");
  await charge.getByLabel("Amount").fill("15");
  await charge.getByRole("button", { name: "Add charge" }).click();
  await expect(page.getByText("Charge added.")).toBeVisible();
  await expect(balance).toHaveText("£65.00 owed");

  // Voiding needs a reason, and the line stays on the statement.
  await page.getByRole("button", { name: /^Void charge of £15\.00/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Void charge" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Added by mistake");
  await dialog.getByRole("button", { name: "Void charge" }).click();
  await expect(page.getByText("Charge voided.")).toBeVisible();
  await expect(balance).toHaveText("£50.00 owed");
  await expect(page.getByText("Voided: Added by mistake")).toBeVisible();

  await page.getByRole("button", { name: /^Reverse payment of £500\.00/ }).click();
  await page.getByRole("alertdialog").getByLabel("Reason").fill("Bounced");
  await page.getByRole("alertdialog").getByRole("button", { name: "Reverse payment" }).click();
  await expect(page.getByText("Payment reversed.")).toBeVisible();
  await expect(balance).toHaveText("£550.00 owed");
  await expect(page.getByTestId("statement-line")).toHaveCount(3);
});
