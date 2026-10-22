import { expect, type Page, test } from "@playwright/test";
import { addHouseShare, addTenancy, londonDate, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** The first of the month, some months from this one, as YYYY-MM-DD. */
function firstOfMonth(monthsFromNow: number) {
  const [year, month] = londonDate().split("-").map(Number) as [number, number];
  const index = year * 12 + (month - 1) + monthsFromNow;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

async function letRoom(page: Page, roomsUrl: string, room: number, first: string, start: string) {
  await page.goto(roomsUrl);
  await page.getByRole("link", { name: `Tenancies for Room ${room}` }).click();
  await addTenancy(page, first, "Collect", start, Number(start.slice(8)));
  await expect(page.getByText(new RegExp(`^Tenancy for ${first} Collect added`))).toBeVisible();
}

async function logRentFor(page: Page, first: string, amount: string) {
  await page
    .getByRole("button", { name: `Log rent for ${first}` })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("log-rent-tenant")).toHaveText(`${first} Collect`);
  await sheet.getByLabel("Amount").fill(amount);
  await sheet.getByRole("button", { name: "Log payment" }).click();
  await expect(page.getByText(/ logged/).first()).toBeVisible();
}

test("the Rent page shows who has paid, part paid or is overdue, with arrears", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const address = uniqueAddress("Collection Close");
  await addHouseShare(page, address, 3);
  const roomsUrl = (await page.getByRole("link", { name: address }).getAttribute("href"))!;
  const propertyId = roomsUrl.split("/").at(-1)!;

  // Ana has lived there since the first of the month two months ago and never paid.
  const anaStart = firstOfMonth(-2);
  await letRoom(page, roomsUrl, 1, "Ana", anaStart);
  // Ben and Cai moved in today, with rent due today.
  await letRoom(page, roomsUrl, 2, "Ben", londonDate());
  await letRoom(page, roomsUrl, 3, "Cai", londonDate());

  await page.goto(`/rent?property=${propertyId}`);
  await expect(page.getByRole("heading", { name: "Rent", exact: true })).toBeVisible();
  await logRentFor(page, "Ben", "200");
  await logRentFor(page, "Cai", "550");
  await page.reload();

  // Ana's charges on the 1st of each month: all overdue, unless today is the 1st.
  const firstToday = londonDate().endsWith("-01");
  const anaOverdue = firstToday ? 2 : 3;
  const row = (first: string) =>
    page
      .getByTestId(test.info().project.name === "phone" ? "collection-card" : "collection-row")
      .filter({ hasText: `${first} Collect` });

  await expect(row("Ana")).toContainText(firstToday ? "Due" : "Overdue");
  await expect(row("Ana")).toContainText(`£${(anaOverdue * 550).toLocaleString("en-GB")}.00`);
  await expect(row("Ben")).toContainText("Part paid");
  await expect(row("Cai")).toContainText("Paid");
  await expect(page.getByTestId("collection-arrears")).toHaveText(
    `£${(anaOverdue * 550).toLocaleString("en-GB")}.00`,
  );

  // Filter to overdue only.
  await page
    .getByRole("navigation", { name: "Rent status" })
    .getByRole("link", { name: "Overdue" })
    .click();
  await expect(row("Ana")).toBeVisible();
  await expect(row("Cai")).toHaveCount(0);

  // The CSV has the same rows.
  const csv = await page.request.get(`/rent/export?property=${propertyId}`);
  expect(csv.ok()).toBe(true);
  const text = await csv.text();
  expect(text).toContain('"Ben Collect"');
  expect(text).toContain('"Part paid"');

  // The property's own Rent section shows the same.
  await page.goto(`/properties/${propertyId}/rent`);
  await expect(row("Ben")).toContainText("Part paid");
  await expect(page.getByLabel("Property", { exact: true })).toHaveCount(0);
});
