import { describe, expect, it } from "vitest";
import { calendarMonthProfit } from "./commerce";

const sale = (at: string, sale: string, cost: string, paid: boolean) => ({
  at,
  sale,
  cost,
  paid,
});

describe("Bénéfice d’un mois calendaire", () => {
  const records = [
    sale("2026-11-02T12:00:00Z", "60", "25", true),
    sale("2026-11-20", "40", "20", false),
    sale("2026-10-31T12:00:00Z", "60", "25", true),
  ];
  it("ne compte que les ventes du mois demandé", () => {
    expect(calendarMonthProfit(records, 2026, 10)).toEqual({
      profit: 60 - 25 - 20,
      sales: 2,
      unpaid: 1,
      incomplete: false,
    });
    expect(calendarMonthProfit(records, 2026, 9).profit).toBe(35);
  });
  it("signale un prix manquant et un mois vide", () => {
    expect(
      calendarMonthProfit([sale("2026-11-05", "", "25", true)], 2026, 10)
        .incomplete,
    ).toBe(true);
    expect(calendarMonthProfit(records, 2026, 0).sales).toBe(0);
  });
});
