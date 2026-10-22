import { expect, type Page, test } from "@playwright/test";
import { addHouseShare, addTenancy, londonDate, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** Fills in and sends the Log rent sheet, which is already open. */
async function logPayment(page: Page, amount: string, reference = "") {
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Amount").fill(amount);
  if (reference) await sheet.getByLabel("Reference (optional)").fill(reference);
  await sheet.getByRole("button", { name: "Log payment" }).click();
}

test("staff log rent, reverse mistakes, and invite the tenant to the portal", async ({ page }) => {
  test.setTimeout(150_000);
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
  const statementUrl = page.url();
  const balance = page.getByTestId("statement-balance");
  await expect(balance).toHaveText("£550.00 owed");
  // Due today, so not overdue yet.
  await expect(page.getByTestId("statement-arrears")).toHaveText("£0.00");
  await expect(page.getByTestId("statement-line")).toHaveCount(1);

  // A part payment, logged from the statement with the tenancy already chosen.
  await page.getByRole("button", { name: "Log rent for this tenancy" }).click();
  await expect(page.getByRole("dialog").getByTestId("log-rent-tenant")).toHaveText("Rina Ledger");
  await logPayment(page, "500", "RINA RENT");
  await expect(
    page.getByText(/^£500\.00 logged: £500\.00 towards Rent .*\(£50\.00 still to pay\)\.$/),
  ).toBeVisible();
  await expect(balance).toHaveText("£50.00 owed");
  await expect(page.getByTestId("charge-status")).toHaveText("Part paid · £50.00 left");
  await expect(page.getByTestId("paid-towards")).toContainText("(£500.00)");

  // A one-off charge adds to it.
  const charge = page.getByRole("form", { name: "Add a charge" });
  await charge.getByLabel("What it's for").fill("Replacement key");
  await charge.getByLabel("Amount").fill("15");
  await charge.getByRole("button", { name: "Add charge" }).click();
  await expect(page.getByText("Charge added.")).toBeVisible();
  await expect(balance).toHaveText("£65.00 owed");

  // Mistakes are reversed with a reason, never deleted.
  await page.getByRole("button", { name: /^Reverse charge of £15\.00/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Reverse charge" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Added by mistake");
  await dialog.getByRole("button", { name: "Reverse charge" }).click();
  await expect(page.getByText("Charge reversed.")).toBeVisible();
  await expect(balance).toHaveText("£50.00 owed");
  await expect(page.getByText("Reason: Added by mistake")).toBeVisible();
  await expect(page.getByText(/^Reversed on \d{2}\/\d{2}\/\d{4}: Added by mistake$/)).toBeVisible();

  await page.getByRole("button", { name: /^Reverse payment of £500\.00/ }).click();
  await page.getByRole("alertdialog").getByLabel("Reason").fill("Bounced");
  await page.getByRole("alertdialog").getByRole("button", { name: "Reverse payment" }).click();
  await expect(page.getByText("Payment reversed.")).toBeVisible();
  await expect(balance).toHaveText("£550.00 owed");
  // Charge, payment, key, and a reversal for each of the last two.
  await expect(page.getByTestId("statement-line")).toHaveCount(5);

  // Log rent from anywhere: the top bar, searching by address.
  await page.goto("/dashboard");
  await page.getByRole("banner").getByRole("button", { name: "Log rent" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Who paid?").fill(address.split(" ")[0]!);
  await sheet.getByRole("button", { name: /Rina Ledger/ }).click();
  await logPayment(page, "600");
  await expect(
    page.getByText(/^£600\.00 logged: clears Rent .*; £50\.00 kept as credit\.$/),
  ).toBeVisible();

  // The same payment twice gets a warning first.
  await page.getByRole("banner").getByRole("button", { name: "Log rent" }).click();
  await sheet.getByLabel("Who paid?").fill(address.split(" ")[0]!);
  await sheet.getByRole("button", { name: /Rina Ledger/ }).click();
  await logPayment(page, "600");
  await expect(sheet.getByRole("alert")).toContainText(
    "looks like a payment you've already logged",
  );
  await sheet.getByRole("button", { name: "Log it anyway" }).click();
  await expect(page.getByText(/^£600\.00 logged: £600\.00 kept as credit\.$/)).toBeVisible();

  // The statement, as a PDF.
  const pdf = await page.request.get(`${statementUrl}/pdf`);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
