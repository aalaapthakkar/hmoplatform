// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildLedger } from "./ledger";
import { renderStatementPdf, statementFileName } from "./statement-pdf";

describe("renderStatementPdf", () => {
  it("makes a PDF of the statement, reversals and all", async () => {
    const ledger = buildLedger(
      [
        {
          id: "oct",
          due_date: "2026-10-01",
          amount_pence: 60000,
          description: "Rent 01/10/2026 to 31/10/2026",
          kind: "rent",
          reverses_charge_id: null,
          created_at: "2026-10-01T00:30:00Z",
        },
      ],
      [
        {
          id: "p1",
          paid_on: "2026-10-02",
          amount_pence: 65000,
          method: "bank_transfer",
          reference: "ROOM 1",
          note: null,
          reverses_payment_id: null,
          created_at: "2026-10-02T09:00:00Z",
        },
        {
          id: "p2",
          paid_on: "2026-10-03",
          amount_pence: 1000,
          method: "cash",
          reference: null,
          note: null,
          reverses_payment_id: null,
          created_at: "2026-10-03T09:00:00Z",
        },
        {
          id: "r2",
          paid_on: "2026-10-04",
          amount_pence: 1000,
          method: "cash",
          reference: null,
          note: "Counted twice",
          reverses_payment_id: "p2",
          created_at: "2026-10-04T09:00:00Z",
        },
      ],
      "2026-10-22",
    );
    const pdf = await renderStatementPdf(
      {
        organisation: "Northside Lettings",
        tenantNames: "Priya Shah",
        room: "Room 1",
        address: "12 High Street, Leeds LS6 2AB",
        rent: "£600.00 a month, due on the 1st of the month",
      },
      ledger,
      "2026-10-22",
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(statementFileName("2026-10-22")).toBe("rent-statement-2026-10-22.pdf");
  }, 30_000);
});
