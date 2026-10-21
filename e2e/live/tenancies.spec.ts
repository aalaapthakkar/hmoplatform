import { expect, type Page, test } from "@playwright/test";
import { addHouseShare, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** Today and other days in London, as the date inputs want them. */
function londonDate(daysFromToday = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

const ukDate = (iso: string) => iso.split("-").reverse().join("/");

async function addTenancy(page: Page, first: string, last: string, startDate: string) {
  await page.getByRole("button", { name: "Add tenancy" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("First name").fill(first);
  await form.getByLabel("Last name").fill(last);
  await form.getByLabel("Start date").fill(startDate);
  await form.getByLabel("Rent per month").fill("550");
  await form.getByLabel("Deposit (optional)").fill("600");
  await form.getByRole("button", { name: "Add tenancy" }).click();
}

/** Picks a tenancy in the switcher: tabs on wider screens, a dropdown on a phone. */
async function chooseTenancy(page: Page, name: string) {
  const dropdown = page.getByLabel("Tenancy", { exact: true });
  if (await dropdown.isVisible()) {
    const option = dropdown.locator("option", { hasText: name });
    await dropdown.selectOption((await option.getAttribute("value"))!);
  } else {
    await page
      .getByRole("navigation", { name: "Tenancies on this room" })
      .getByRole("link", { name: new RegExp(name) })
      .click();
  }
  await expect(page.getByTestId("tenancy-panel").getByRole("heading", { name })).toBeVisible();
}

test("a room's tenancies: let, line up the next tenant, give notice, end and move in", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const address = uniqueAddress("Tenancy Lane");
  await addHouseShare(page, address, 2);
  const href = await page.getByRole("link", { name: address }).getAttribute("href");
  await page.goto(href!);
  await page.getByRole("link", { name: "Tenancies for Room 1" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Room 1" })).toBeVisible();
  await expect(page.getByText("No tenancies yet")).toBeVisible();

  // A tenancy from today is current, periodic, and lets the room.
  await addTenancy(page, "Asha", "Patel", londonDate());
  await expect(page.getByText("Tenancy for Asha Patel added.")).toBeVisible();
  const panel = page.getByTestId("tenancy-panel");
  await expect(panel).toContainText("Current");
  await expect(panel).toContainText("Periodic (no fixed end date)");
  await expect(panel).toContainText("£550.00 per month");
  await expect(page.getByTestId("room-status")).toHaveText("Let");

  // The deposit cap is explained before saving.
  await page.getByRole("button", { name: "Add tenancy" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Rent per month").fill("550");
  await form.getByLabel("Deposit (optional)").fill("700");
  await expect(form.getByText("At most £634.61 (5 weeks' rent), by law.")).toBeVisible();
  await form.getByRole("button", { name: "Add tenancy" }).click();
  await expect(form.getByText("The deposit can be at most £634.61 (5 weeks' rent).")).toBeVisible();
  // So is the one-current-tenancy rule.
  await expect(form.getByText(/already has a current tenancy/)).toBeVisible();
  await page.keyboard.press("Escape");

  // One upcoming tenancy can be lined up; then Add tenancy goes away.
  await addTenancy(page, "Ben", "Okoro", londonDate(14));
  await expect(page.getByText("Tenancy for Ben Okoro added.")).toBeVisible();
  await expect(page.getByTestId("tenancy-panel")).toContainText("Upcoming");
  await expect(page.getByRole("button", { name: "Add tenancy" })).toHaveCount(0);

  // Notice on the current tenancy, ending today.
  await chooseTenancy(page, "Asha Patel");
  await panel.getByRole("button", { name: "Record notice" }).click();
  const notice = page.getByRole("dialog");
  await notice.getByLabel("Notice given on").fill(londonDate());
  await notice.getByLabel("Last day").fill(londonDate());
  await expect(notice.getByText(/less than two months' notice/)).toBeVisible();
  await notice.getByLabel("Ending early by agreement").check();
  await expect(notice.getByText(/less than two months' notice/)).toHaveCount(0);
  await notice.getByRole("button", { name: "Record notice" }).click();
  await expect(page.getByText("Notice recorded.")).toBeVisible();
  await expect(panel).toContainText("Notice given");
  await expect(panel).toContainText("Check the tenant has moved out");

  // Mark it ended: the room is free and Asha moves to the history.
  await panel.getByRole("button", { name: "Mark as ended" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark as ended" }).click();
  await expect(page.getByText("Tenancy marked as ended. The room is free.")).toBeVisible();
  await expect(page.getByTestId("room-status")).toHaveText("Available");

  // Ben can't move in before his start date.
  await chooseTenancy(page, "Ben Okoro");
  await expect(panel.getByRole("button", { name: "Move in" })).toBeDisabled();
  await expect(panel).toContainText(`You can move the tenant in from ${ukDate(londonDate(14))}.`);
  await panel.getByRole("button", { name: "Cancel tenancy" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel tenancy" }).click();
  await expect(page.getByText("Upcoming tenancy cancelled.")).toBeVisible();

  // A new tenant from today moves straight in.
  await addTenancy(page, "Cara", "Lewis", londonDate());
  await expect(page.getByText("Tenancy for Cara Lewis added.")).toBeVisible();
  await expect(panel).toContainText("Current");

  // The switcher reaches the past and cancelled tenancies.
  await chooseTenancy(page, "Asha Patel");
  await expect(panel).toContainText("Ended");
  await expect(panel).toContainText("Ending early by agreement");
  await chooseTenancy(page, "Ben Okoro");
  await expect(panel).toContainText("Cancelled");

  // The room card shows the current tenant.
  await page.getByRole("link", { name: "← All rooms" }).click();
  const card = page.getByTestId("room-card").filter({ hasText: "Room 1" });
  await expect(card).toContainText("Cara Lewis");
  await expect(card).toContainText("Let");

  // Occupancy, filtered to this property: Room 1 let to Cara, Room 2 vacant now.
  const propertyId = href!.split("/").pop()!;
  await page.goto(`/occupancy?property=${propertyId}`);
  await expect(page.getByTestId("occupancy-summary")).toHaveText("2 rooms · 1 let · 1 vacant");
  const main = page.getByRole("main");
  await expect(main.getByText("Cara Lewis").locator("visible=true")).toHaveCount(1);
  await page.goto(`/occupancy?property=${propertyId}&status=vacant`);
  await expect(page.getByTestId("occupancy-summary")).toHaveText("1 room · 0 let · 1 vacant");

  // The CSV has the same rooms, with names but no contact details.
  await page.goto(`/occupancy?property=${propertyId}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^occupancy-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain(
    `"${address}","LS6 2AB","Room 1","Let","Cara Lewis","£550.00 per month"`,
  );
  expect(lines[2]).toContain('"Room 2","Vacant",""');
});
