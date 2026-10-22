import { expect, test } from "@playwright/test";
import { addHouseShare, uniqueAddress } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run the live tests.",
);

/** A minimal PDF, so the upload doesn't depend on a file on disk. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test("the property hub manages rooms, ownership, details and documents, with a history", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const address = uniqueAddress("Hub Road");
  await addHouseShare(page, address, 3);

  // Open the property from its card, with a fresh page load: Next.js keeps
  // the wizard mounted (hidden) after client-side navigation, and its fields
  // share labels with the Ownership form.
  const href = await page.getByRole("link", { name: address }).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1, name: address })).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Property sections" });
  const rooms = page.getByTestId("room-card");
  await expect(rooms).toHaveCount(3);

  // Rooms: edit, add and archive.
  await page.getByRole("button", { name: "Edit Room 1" }).click();
  await page.getByLabel("Rent (optional)").fill("550");
  await page.getByRole("button", { name: "Save room" }).click();
  await expect(page.getByText("Room 1 saved.")).toBeVisible();
  await expect(rooms.filter({ hasText: "Room 1" })).toContainText("£550.00 per month");

  await page.getByRole("button", { name: "Add room" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Room 4");
  await page.getByLabel("Rent (optional)").fill("575");
  await page.getByRole("button", { name: "Add room" }).last().click();
  await expect(page.getByText("Room 4 added.")).toBeVisible();
  await expect(rooms).toHaveCount(4);

  await page.getByRole("button", { name: "Archive Room 4" }).click();
  await page.getByRole("button", { name: "Archive room" }).click();
  await expect(page.getByText("Room 4 archived.")).toBeVisible();
  await expect(rooms).toHaveCount(3);
  await expect(page.getByText("Show archived rooms (1)")).toBeVisible();

  // Ownership: managed for a new owner.
  await sections.getByRole("link", { name: "Ownership" }).click();
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("Managed for an owner").check();
  await page.getByLabel("Someone new").check();
  await page.getByLabel("Name", { exact: true }).fill("Hub Test Owner");
  await page.getByRole("button", { name: "Save ownership" }).click();
  await expect(page.getByText("Ownership saved.")).toBeVisible();
  await expect(page.getByText("Managed for an owner")).toBeVisible();
  await expect(page.getByText("Hub Test Owner")).toBeVisible();

  // Details.
  await sections.getByRole("link", { name: "Details" }).click();
  await page.getByLabel("Description").fill("Three doubles near the park.");
  await page.getByLabel("Wi-Fi").check();
  await page.getByLabel("Bills included").check();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();

  // Documents: an expired EICR lights up the overdue badge.
  await sections.getByRole("link", { name: "Documents" }).click();
  await page.getByLabel("Type").selectOption("eicr");
  await page.getByLabel("Expiry date (optional)").fill("2026-01-31");
  await page
    .getByLabel("File")
    .setInputFiles({ name: "hub-eicr.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("hub-eicr.pdf uploaded.")).toBeVisible({ timeout: 15_000 });
  const document = page.getByTestId("document-row").filter({ hasText: "hub-eicr.pdf" });
  await expect(document).toContainText("Expired");
  await expect(page.getByText("1 overdue").first()).toBeVisible();

  // Activity: the changes above, in plain words.
  await sections.getByRole("link", { name: "Activity" }).click();
  const entries = page.getByTestId("activity-entry");
  await expect(entries.filter({ hasText: "Rent: none → £550.00" })).toHaveCount(1);
  await expect(entries.filter({ hasText: "Room archived" })).toHaveCount(1);
  await expect(entries.filter({ hasText: "Uploaded hub-eicr.pdf" })).toHaveCount(1);
  await expect(entries.filter({ hasText: "Hub Test Owner" }).first()).toContainText(
    "Linked as owner",
  );

  // The expired EICR uploaded above counts as the property's EICR, overdue.
  await sections.getByRole("link", { name: /Compliance/ }).click();
  await expect(
    page
      .locator('[data-testid="compliance-item"][data-type="eicr"]')
      .getByTestId("compliance-status"),
  ).toHaveText("Overdue");
});
