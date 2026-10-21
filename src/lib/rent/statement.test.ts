import { describe, expect, it } from "vitest";
import { balanceLabel, buildStatement, type ChargeRow, type PaymentRow } from "./statement";

const charge = (
  id: string,
  date: string,
  pence: number,
  extra: Partial<ChargeRow> = {},
): ChargeRow => ({
  id,
  due_date: date,
  amount_pence: pence,
  description: `Rent from ${date}`,
  status: "active",
  void_reason: null,
  kind: "rent",
  ...extra,
});
const payment = (
  id: string,
  date: string,
  pence: number,
  extra: Partial<PaymentRow> = {},
): PaymentRow => ({
  id,
  paid_on: date,
  amount_pence: pence,
  method: "bank_transfer",
  reference: null,
  status: "active",
  void_reason: null,
  ...extra,
});

describe("buildStatement", () => {
  it("runs a balance in date order, with charges before payments on the same day", () => {
    const statement = buildStatement(
      [charge("c1", "2026-09-01", 60000), charge("c2", "2026-10-01", 60000)],
      [
        payment("p1", "2026-09-01", 60000, { reference: "SHAH RENT" }),
        payment("p2", "2026-10-03", 50000),
      ],
    );
    expect(
      statement.lines.map((line) => [
        line.dateLabel,
        line.type,
        line.description,
        line.balancePence,
      ]),
    ).toEqual([
      ["01/09/2026", "charge", "Rent from 2026-09-01", 60000],
      ["01/09/2026", "payment", "Bank transfer · SHAH RENT", 0],
      ["01/10/2026", "charge", "Rent from 2026-10-01", 60000],
      ["03/10/2026", "payment", "Bank transfer", 10000],
    ]);
    expect(statement).toMatchObject({ balancePence: 10000, balanceLabel: "£100.00 owed" });
  });

  it("lists voided entries without counting them", () => {
    const statement = buildStatement(
      [
        charge("c1", "2026-09-01", 60000),
        charge("c2", "2026-09-05", 2500, { status: "voided", void_reason: "Added by mistake" }),
      ],
      [
        payment("p1", "2026-09-02", 60000),
        payment("p2", "2026-09-03", 60000, { status: "voided", void_reason: "Bounced" }),
      ],
    );
    expect(statement.balancePence).toBe(0);
    expect(statement.lines.filter((line) => line.voided)).toMatchObject([
      { id: "p2", balancePence: null, voidReason: "Bounced" },
      { id: "c2", balancePence: null, voidReason: "Added by mistake" },
    ]);
  });

  it("describes the balance", () => {
    expect(balanceLabel(12345)).toBe("£123.45 owed");
    expect(balanceLabel(-1500)).toBe("£15.00 in credit");
    expect(balanceLabel(0)).toBe("Up to date");
  });
});
